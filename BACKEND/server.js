const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const axios = require('axios');
const Transaction = require('./models/Transaction');

const app = express();
const PORT = 5000;

// Connect to MongoDB
mongoose.connect('mongodb://localhost:27017/productDB', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
}).then(() => console.log('MongoDB Connected'))
  .catch((err) => console.log(err));

app.use(express.json());
app.use(cors());

// API to fetch data and seed the database
app.get('/seed-data', async (req, res) => {
  try {
    const response = await axios.get('https://s3.amazonaws.com/roxiler.com/product_transaction.json');
    const transactions = response.data;
    await Transaction.insertMany(transactions);
    res.send('Data has been seeded to the database');
  } catch (error) {
    console.error(error);
    res.status(500).send('Error seeding data');
  }
});

// API to list transactions with search and pagination
app.get('/transactions', async (req, res) => {
  const { month, search, page = 1, perPage = 10 } = req.query;
  const skip = (page - 1) * perPage;
  const query = {
    dateOfSale: { $regex: month, $options: 'i' },
  };

  if (search) {
    query.$or = [
      { title: { $regex: search, $options: 'i' } },
      { description: { $regex: search, $options: 'i' } },
      { price: { $regex: search, $options: 'i' } },
    ];
  }

  const transactions = await Transaction.find(query).skip(skip).limit(parseInt(perPage));
  res.json(transactions);
});

// API for statistics
app.get('/statistics', async (req, res) => {
  const { month } = req.query;

  const totalSales = await Transaction.aggregate([
    { $match: { dateOfSale: { $regex: month, $options: 'i' } } },
    { $group: {
      _id: null,
      totalAmount: { $sum: "$price" },
      totalSold: { $sum: { $cond: ["$sold", 1, 0] } },
      totalNotSold: { $sum: { $cond: ["$sold", 0, 1] } }
    }}
  ]);

  res.json(totalSales[0]);
});

// API for bar chart data
app.get('/bar-chart', async (req, res) => {
  const { month } = req.query;

  const priceRanges = [
    { range: '0-100', min: 0, max: 100 },
    { range: '101-200', min: 101, max: 200 },
    { range: '201-300', min: 201, max: 300 },
    { range: '301-400', min: 301, max: 400 },
    { range: '401-500', min: 401, max: 500 },
    { range: '501-600', min: 501, max: 600 },
    { range: '601-700', min: 601, max: 700 },
    { range: '701-800', min: 701, max: 800 },
    { range: '801-900', min: 801, max: 900 },
    { range: '901-above', min: 901, max: Infinity }
  ];

  const barData = await Promise.all(priceRanges.map(async (range) => {
    const count = await Transaction.countDocuments({
      price: { $gte: range.min, $lte: range.max },
      dateOfSale: { $regex: month, $options: 'i' }
    });
    return { range: range.range, count };
  }));

  res.json(barData);
});

// API for pie chart data
app.get('/pie-chart', async (req, res) => {
  const { month } = req.query;

  const pieData = await Transaction.aggregate([
    { $match: { dateOfSale: { $regex: month, $options: 'i' } } },
    { $group: {
      _id: "$category",
      itemCount: { $sum: 1 }
    }}
  ]);

  res.json(pieData);
});

// Combine data from all APIs
app.get('/combined-data', async (req, res) => {
  const { month } = req.query;

  const [transactions, statistics, barChart, pieChart] = await Promise.all([
    Transaction.find({ dateOfSale: { $regex: month, $options: 'i' } }),
    Transaction.aggregate([
      { $match: { dateOfSale: { $regex: month, $options: 'i' } } },
      { $group: {
        _id: null,
        totalAmount: { $sum: "$price" },
        totalSold: { $sum: { $cond: ["$sold", 1, 0] } },
        totalNotSold: { $sum: { $cond: ["$sold", 0, 1] } }
      }}
    ]),
    Promise.all(priceRanges.map(async (range) => {
      const count = await Transaction.countDocuments({
        price: { $gte: range.min, $lte: range.max },
        dateOfSale: { $regex: month, $options: 'i' }
      });
      return { range: range.range, count };
    })),
    Transaction.aggregate([
      { $match: { dateOfSale: { $regex: month, $options: 'i' } } },
      { $group: {
        _id: "$category",
        itemCount: { $sum: 1 }
      }}
    ])
  ]);

  res.json({
    transactions,
    statistics: statistics[0],
    barChart,
    pieChart
  });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

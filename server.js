const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();

app.use(cors());
app.use(express.json());

// INAYOS NA: Tinatawag na nito ang MONGO_URI variable mula sa Vercel Settings na ginawa natin kanina para sa secure at stable cloud storage connection!
const MONGO_URI = process.env.MONGO_URI;

mongoose.connect(MONGO_URI)
  .then(() => console.log('✅ Connected na tayo sa MongoDB Atlas!'))
  .catch((err) => console.error('❌ Oops, may error sa koneksyon:', err));

const Transaction = mongoose.model('Transaction', new mongoose.Schema({
  trackingNumber: { type: String, unique: true },
  firstName: { type: String, required: true },
  middleName: { type: String, default: '' },
  lastName: { type: String, required: true },
  purpose: { type: String, required: true },
  subPurpose: { type: String, default: '' },
  otherSpecify: { type: String, default: '' },
  dateNeeded: { type: String, default: '' },
  urgency: { type: String, default: 'Regular' },
  status: { type: String, default: 'Pending' },
  createdAt: { type: Date, default: Date.now }
}));

// ==================== ENDPOINTS ====================

app.post('/api/transactions', async (req, res) => {
  try {
    const ngayon = new Date();
    const taon = ngayon.getFullYear();
    const buwan = String(ngayon.getMonth() + 1).padStart(2, '0'); 
    const araw = String(ngayon.getDate()).padStart(2, '0');      
    
    const datePrefix = `${taon}${buwan}${araw}`; 

    const simulaNgAraw = new Date(ngayon.setHours(0,0,0,0));
    const duloNgAraw = new Date(ngayon.setHours(23,59,59,999));

    const bilangNgayon = await Transaction.countDocuments({
      createdAt: { $gte: simulaNgAraw, $lte: duloNgAraw }
    });

    const sunodNaBilang = String(bilangNgayon + 1).padStart(4, '0');
    const pinalNaTracking = `${datePrefix}-${sunodNaBilang}`;

    const transactionData = { ...req.body, trackingNumber: pinalNaTracking };
    const newTx = new Transaction(transactionData);
    const saved = await newTx.save();
    
    res.status(201).json({ success: true, data: saved });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

app.get('/api/transactions', async (req, res) => {
  try {
    const list = await Transaction.find().sort({ createdAt: -1 });
    res.status(200).json({ success: true, data: list });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.put('/api/transactions/:id', async (req, res) => {
  try {
    const updated = await Transaction.findByIdAndUpdate(
      req.params.id,
      { status: req.body.status },
      { new: true }
    );
    res.status(200).json({ success: true, data: updated });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

if (process.env.NODE_ENV !== 'production') {
  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => {
    console.log(`🚀 Server running locally on port ${PORT}`);
  });
}

module.exports = app;


const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();

app.use(cors());
app.use(express.json());

const MONGO_URI = process.env.MONGO_URI;

let isConnected = false;

const connectDB = async () => {
  if (isConnected && mongoose.connection.readyState >= 1) return;
  try {
    await mongoose.connect(MONGO_URI, { bufferCommands: false, serverSelectionTimeoutMS: 5000 });
    isConnected = true;
    console.log('✅ Connected sa MongoDB!');
  } catch (err) {
    console.error('❌ MongoDB Connection Error:', err);
    throw err;
  }
};

// 1. Transaction Schema
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

// 2. Admin System Schema (Para dito i-save ang PIN nang ligtas)
const SystemConfig = mongoose.model('SystemConfig', new mongoose.Schema({
  key: { type: String, default: 'admin_config' },
  adminPin: { type: String, default: '1234' } // Default PIN sa unang takbo
}));

// MIDDLEWARE: Dito tsetsekin ng server kung tama ang pin na pinasa ng phone/laptop mo
const checkAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token) return res.status(401).json({ success: false, message: '🔒 No token provided!' });
    
    await connectDB();
    let config = await SystemConfig.findOne({ key: 'admin_config' });
    if (!config) {
      config = await SystemConfig.create({ key: 'admin_config', adminPin: '1234' });
    }

    if (token !== config.adminPin) {
      return res.status(401).json({ success: false, message: '🔒 Unauthorized!' });
    }
    next();
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server auth error' });
  }
};

// ==================== ENDPOINTS ====================

// 📄 PUBLIC: Submit Transaction
app.post('/api/transactions', async (req, res) => {
  try {
    await connectDB();
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

    const sunodNaBilang = String(bilangNgayon + 1).padStart(3, '0');
    const pinalNaTracking = `${datePrefix}-${sunodNaBilang}`;

    const transactionData = { ...req.body, trackingNumber: pinalNaTracking, createdAt: new Date() };
    const newTx = new Transaction(transactionData);
    const saved = await newTx.save();
    
    res.status(201).json({ success: true, data: saved });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// 📊 PROTECTED: Get All Transactions
app.get('/api/transactions', checkAuth, async (req, res) => {
  try {
    const list = await Transaction.find().sort({ createdAt: -1 });
    res.status(200).json({ success: true, data: list });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ⚙️ PROTECTED: Update Status
app.put('/api/transactions/:id', checkAuth, async (req, res) => {
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

// 🔑 PUBLIC: Verify PIN (Para sa Login ng Frontend)
app.post('/api/admin/verify-pin', async (req, res) => {
  try {
    await connectDB();
    const { pin } = req.body;
    let config = await SystemConfig.findOne({ key: 'admin_config' });
    if (!config) config = await SystemConfig.create({ key: 'admin_config', adminPin: '1234' });

    if (pin === config.adminPin) {
      res.status(200).json({ success: true, message: "Valid PIN" });
    } else {
      res.status(401).json({ success: false, message: "Maling PIN!" });
    }
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 🔒 PROTECTED: Change PIN sa Database (Sync sa lahat ng device)
app.post('/api/admin/change-pin', checkAuth, async (req, res) => {
  try {
    const { newPin } = req.body;
    if (!newPin || newPin.length < 4) {
      return res.status(400).json({ success: false, message: "Dapat kahit 4 digits ang PIN." });
    }
    await connectDB();
    await SystemConfig.findOneAndUpdate({ key: 'admin_config' }, { adminPin: newPin });
    res.status(200).json({ success: true, message: "PIN updated successfully!" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

if (process.env.NODE_ENV !== 'production') {
  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
}

module.exports = app;

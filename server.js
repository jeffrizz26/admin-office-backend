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

// 1. Transaction Schema (INAYOS ANG SYNTAX BUG DITO)
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
  assistedBy: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now },
  equipmentName: { type: String, required: false, default: "" }
}, { timestamps: true })); // <-- Koma (,) at pagsasara ng tama ang inilagay dito!

// 1.5 Staff/Assistant Schema
const Assistant = mongoose.model('Assistant', new mongoose.Schema({
  name: { type: String, required: true, unique: true }
}));

// 1.6 DYNAMIC PURPOSE SCHEMA (Added for Dynamic Control)
const Purpose = mongoose.model('Purpose', new mongoose.Schema({
  name: { type: String, required: true },
  subPurposes: [String]
}));

// 2. Admin System Schema
const SystemConfig = mongoose.model('SystemConfig', new mongoose.Schema({
  key: { type: String, default: 'admin_config' },
  adminPin: { type: String, default: '1234' }
}));

// MIDDLEWARE
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
    const serverNgayon = new Date();
    const phtOffset = 8 * 60 * 60 * 1000;
    const phtDate = new Date(serverNgayon.getTime() + phtOffset);
    const taon = phtDate.getUTCFullYear();
    const buwan = String(phtDate.getUTCMonth() + 1).padStart(2, '0'); 
    const araw = String(phtDate.getUTCDate()).padStart(2, '0');      
    const datePrefix = `${taon}${buwan}${araw}`; 
    const simulaNgAraw = new Date(Date.UTC(taon, phtDate.getUTCMonth(), phtDate.getUTCDate()) - phtOffset);
    const duloNgAraw = new Date(simulaNgAraw.getTime() + (24 * 60 * 60 * 1000) - 1);

    const bilangNgayon = await Transaction.countDocuments({ createdAt: { $gte: simulaNgAraw, $lte: duloNgAraw } });
    const sunodNaBilang = String(bilangNgayon + 1).padStart(3, '0');
    const pinalNaTracking = `${datePrefix}-${sunodNaBilang}`;

    // Safety Clean-up: I-save lang ang equipmentName kapag tama ang purpose, kung hindi, gawing blanko.
    let finalEquipmentName = req.body.equipmentName || "";
    if (req.body.purpose !== "Request Supply / Equipment") {
      finalEquipmentName = "";
    }

    const transactionData = { 
      ...req.body, 
      equipmentName: finalEquipmentName,
      trackingNumber: pinalNaTracking, 
      createdAt: new Date() 
    };

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
    await connectDB(); // Siguraduhing konektado bago mag-fetch
    const list = await Transaction.find().sort({ createdAt: -1 });
    res.status(200).json({ success: true, data: list });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ⚙️ PROTECTED: Update Status
app.put('/api/transactions/:id', checkAuth, async (req, res) => {
  try {
    await connectDB(); // Siguraduhing konektado bago mag-update
    const updated = await Transaction.findByIdAndUpdate(req.params.id, { status: req.body.status }, { new: true });
    res.status(200).json({ success: true, data: updated });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// 🔑 PUBLIC: Verify PIN
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

// 🔒 PROTECTED: Change PIN
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

// 👥 PUBLIC: Get Assistants
app.get('/api/assistants', async (req, res) => {
  try {
    await connectDB();
    const list = await Assistant.find({});
    res.status(200).json({ success: true, data: list.map(ast => ast.name) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ➕ PROTECTED: Add Assistant
app.post('/api/assistants', checkAuth, async (req, res) => {
  try {
    const { name } = req.body;
    await connectDB();
    await Assistant.findOneAndUpdate({ name: name.trim() }, { name: name.trim() }, { upsert: true, new: true });
    const list = await Assistant.find({});
    res.status(200).json({ success: true, data: list.map(ast => ast.name) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ❌ PROTECTED: Remove Assistant
app.post('/api/assistants/remove', checkAuth, async (req, res) => {
  try {
    const { name } = req.body;
    await connectDB();
    await Assistant.deleteOne({ name: name.trim() });
    const list = await Assistant.find({});
    res.status(200).json({ success: true, data: list.map(ast => ast.name) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 🆕 DYNAMIC PURPOSES API
app.get('/api/purposes', async (req, res) => {
  try {
    await connectDB();
    const list = await Purpose.find();
    res.status(200).json({ success: true, data: list });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

app.post('/api/purposes', checkAuth, async (req, res) => {
  try {
    await connectDB();
    const { name, subPurposes } = req.body;
    await Purpose.create({ name, subPurposes });
    res.status(200).json({ success: true, message: "Added successfully" });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

app.delete('/api/purposes/:id', checkAuth, async (req, res) => {
  try {
    await connectDB();
    await Purpose.findByIdAndDelete(req.params.id);
    res.status(200).json({ success: true, message: "Deleted successfully" });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

if (process.env.NODE_ENV !== 'production') {
  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
}

module.exports = app;

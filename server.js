const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();

app.use(cors({
  origin: 'http://localhost:5174',
  credentials: true
}));

app.use(express.json());

const MONGO_URI = "mongodb://jeffrizz26:jeffrizz26sl4y3r75@ac-ixyhns0-shard-00-00.zxke0zs.mongodb.net:27017,ac-ixyhns0-shard-00-01.zxke0zs.mongodb.net:27017,ac-ixyhns0-shard-00-02.zxke0zs.mongodb.net:27017/?ssl=true&replicaSet=atlas-owa68i-shard-0&authSource=admin&appName=AdminOfficeSystem";

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

// MATALINONG ROUTE PARA SA KUSA AT SUNOD-SUNOD NA TRACKING NUMBER FORMAT (YYYYMMDD-XXXX)
app.post('/api/transactions', async (req, res) => {
  try {
    const ngayon = new Date();
    const taon = ngayon.getFullYear();
    const buwan = String(ngayon.getMonth() + 1).padStart(2, '0'); // Nagiging '05' kung May
    const araw = String(ngayon.getDate()).padStart(2, '0');      // Nagiging '20' kung ika-20 ng buwan
    
    const datePrefix = `${taon}${buwan}${araw}`; // Halimbawa: "20260520"

    // Kukunin natin ang simula at dulo ng araw na ito para mabilang kung ilang transaksyon na ang nagawa ngayon
    const simulaNgAraw = new Date(ngayon.setHours(0,0,0,0));
    const duloNgAraw = new Date(ngayon.setHours(23,59,59,999));

    // Bibilangin sa MongoDB kung ilan ang transaksyon na pumasok sa pagitan ng simula at dulo ng araw na ito
    const bilangNgayon = await Transaction.countDocuments({
      createdAt: { $gte: simulaNgAraw, $lte: duloNgAraw }
    });

    // Ang susunod na bilang ay bilangNgayon + 1, at lalagyan ng leading zeros para maging 4 digits (-0001)
    const sunodNaBilang = String(bilangNgayon + 1).padStart(4, '0');
    
    // Pagsasamahin para sa pinal na format: "20260520-0001"
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

const PORT = 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

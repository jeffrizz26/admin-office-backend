const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();

app.use(cors());
app.use(express.json());

const MONGO_URI = process.env.MONGO_URI;
const ADMIN_SECRET_PASSWORD = '1234'; // Ang sikretong susi na dapat katugma ng nasa Frontend

// SMART CONNECTION LOGIC: Iniwasan natin ang buffering para hindi mag-hang ang Vercel kapag galing sa cold start!
let isConnected = false;

const connectDB = async () => {
  if (isConnected && mongoose.connection.readyState >= 1) {
    return;
  }
  
  try {
    await mongoose.connect(MONGO_URI, {
      bufferCommands: false, // Bawal mag-antay ng 10 segundo kapag tulog ang database
      serverSelectionTimeoutMS: 5000 // Pagkalipas ng 5 segundo, mag-reconnect agad imbes na mag-freeze
    });
    isConnected = true;
    console.log('✅ Connected na tayo sa MongoDB Atlas!');
  } catch (err) {
    console.error('❌ Oops, may error sa koneksyon:', err);
    throw err;
  }
};

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

// 📄 PUBLIC ENDPOINT: Pwede mag-submit ang kahit sino kahit walang password
app.post('/api/transactions', async (req, res) => {
  try {
    await connectDB(); // Siguraduhing gising ang koneksyon bago mag-bilang at mag-save

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

// 📊 PROTECTED ENDPOINT: Para sa Admin Dashboard lang (Bawal ang walang tamang PIN)
app.get('/api/transactions', async (req, res) => {
  try {
    // 🔒 Tsek kung may dalang Authorization Token ang nagre-request
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Kinukuha ang password pagkatapos ng "Bearer "

    if (!token || token !== ADMIN_SECRET_PASSWORD) {
      return res.status(401).json({ success: false, message: '🔒 Unauthorized Access! Bawal pumasok ang walang tamang PIN.' });
    }

    await connectDB(); // Siguraduhing gising ang koneksyon bago mag-pull ng listahan
    
    const list = await Transaction.find().sort({ createdAt: -1 });
    res.status(200).json({ success: true, data: list });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ⚙️ PROTECTED ENDPOINT: Para sa pag-update ng status (Bawal baguhin ng basta-basta)
app.put('/api/transactions/:id', async (req, res) => {
  try {
    // 🔒 Tsek kung may dalang Authorization Token ang nagre-request
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token || token !== ADMIN_SECRET_PASSWORD) {
      return res.status(401).json({ success: false, message: '🔒 Unauthorized Access! Bawal baguhin ang status.' });
    }

    await connectDB(); // Siguraduhing gising ang koneksyon bago mag-update ng status
    
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

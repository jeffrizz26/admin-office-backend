require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const cloudinary = require('cloudinary').v2;

const app = express();

// ✅ CORS SETUP
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

// Cloudinary Configuration
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

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

// ==================== DATABASE SCHEMAS ====================
// Sinasalo nito lahat ng posibleng hula ng Vibe Coding frontend mo para walang tapon!
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
  equipmentName: { type: String, required: false, default: "" },
  
  // 📥 MGA SALUHAN NG ATTACHMENT NI TEACHER
  secureFileId: { type: String, default: "" },  
  fileName: { type: String, default: "" },      
  teacherAttachmentUrl: { type: String, default: "" },
  teacherAttachmentName: { type: String, default: "" },
  teacherFileId: { type: String, default: "" },
  teacherFileName: { type: String, default: "" },

  // 📤 PARA NAMAN KAY ADMIN (Para sa download ni teacher mamaya)
  adminFileId: { type: String, default: "" },  
  adminFileName: { type: String, default: "" },      
  teacherPin: { type: String, default: "" }     
}, { timestamps: true }));

const SystemConfig = mongoose.model('SystemConfig', new mongoose.Schema({
  key: { type: String, default: 'admin_config' },
  adminPin: { type: String, default: '1234' }
}));

// ==================== SECURITY MIDDLEWARE ====================
const checkAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    if (!authHeader) return res.status(401).json({ success: false, message: '🔒 No token provided!' });

    const token = authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : authHeader;
    
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

// ==================== SYSTEM ENDPOINTS ====================

// 1. TEACHER SUBMIT REQUEST (Sinasalo lahat ng variations ng file fields)
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

    let finalEquipmentName = req.body.equipmentName || "";
    if (req.body.purpose !== "Request Supply / Equipment") {
      finalEquipmentName = "";
    }

    // Alin man ang ipadala ng frontend mo, mapupuno lahat ng fields na ito para walang mintis!
    const pinalNaFileId = req.body.secureFileId || req.body.teacherAttachmentUrl || req.body.teacherFileId || "";
    const pinalNaFileName = req.body.fileName || req.body.teacherAttachmentName || req.body.teacherFileName || "";

    const transactionData = { 
      ...req.body, 
      equipmentName: finalEquipmentName,
      trackingNumber: pinalNaTracking, 
      createdAt: new Date(),
      
      // I-populate lahat para kahit alin ang basahin ng UI table mo, may makikitang link!
      secureFileId: pinalNaFileId,
      teacherAttachmentUrl: pinalNaFileId,
      teacherFileId: pinalNaFileId,
      
      fileName: pinalNaFileName,
      teacherAttachmentName: pinalNaFileName,
      teacherFileName: pinalNaFileName
    };

    const newTx = new Transaction(transactionData);
    const saved = await newTx.save();
    
    res.status(201).json({ success: true, data: saved });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// 2. KUNIN ANG LAHAT NG TRANSAKSYON (ADMIN DASHBOARD)
app.get('/api/transactions', checkAuth, async (req, res) => {
  try {
    await connectDB();
    const list = await Transaction.find().sort({ createdAt: -1 });
    res.status(200).json({ success: true, data: list });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 3. MAG-UPDATE NG STATUS (ADMIN ACTION - SAFE FROM OVERWRITING TEACHER FILES)
app.put('/api/transactions/:id', checkAuth, async (req, res) => {
  try {
    await connectDB();
    
    const kasalukuyangTx = await Transaction.findById(req.params.id);
    if (!kasalukuyangTx) {
      return res.status(404).json({ success: false, message: "Transaction not found" });
    }

    // Kapag nag-update si admin, isave natin ang file ni admin sa hiwalay na field (`adminFileId`)
    // para hindi masira o mabura ang file fields ni teacher sa itaas
    const updateData = {
      status: req.body.status,
      adminFileId: req.body.secureFileId || kasalukuyangTx.adminFileId || "",
      adminFileName: req.body.fileName || kasalukuyangTx.adminFileName || "",
      teacherPin: req.body.teacherPin || kasalukuyangTx.teacherPin || ""
    };

    const updated = await Transaction.findByIdAndUpdate(req.params.id, updateData, { new: true });
    res.status(200).json({ success: true, data: updated });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// 4. DOWNLOAD ROUTE PARA KAY TEACHER (Kukunin ang file na galing kay Admin)
app.post('/api/transactions/secure-download', async (req, res) => {
  try {
    const { trackingNumber, teacherPin } = req.body;
    await connectDB();

    const tx = await Transaction.findOne({ trackingNumber });
    if (!tx) {
      return res.status(404).json({ success: false, message: "Maling Tracking Number!" });
    }
    if (!tx.adminFileId) {
      return res.status(400).json({ success: false, message: "Wala pang file para sa request na ito." });
    }

    if (tx.teacherPin !== teacherPin) {
      return res.status(403).json({ success: false, message: "Maling Guro! Hindi tugma ang PIN." });
    }

    return res.json({
      success: true,
      downloadUrl: tx.adminFileId,
      fileName: tx.adminFileName
    });

  } catch (error) {
    console.error("Secure Download Error:", error);
    res.status(500).json({ success: false, message: "Server Error sa pag-download." });
  }
});

// 5. ADMIN VERIFY LOGIN PIN
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

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
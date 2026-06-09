require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();

// ✅ CORS SETUP
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

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

// ==================== DATABASE SCHEMAS ====================
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
  
  // 🔄 EQUIPMENT RETURN STATUS
  equipmentReturned: { type: Boolean, default: false },
  
  // 📥 MGA SALUHAN NG ATTACHMENT NI TEACHER
  secureFileId: { type: String, default: "" },  
  fileName: { type: String, default: "" },      
  teacherAttachmentUrl: { type: String, default: "" },
  teacherAttachmentName: { type: String, default: "" },
  teacherFileId: { type: String, default: "" },
  teacherFileName: { type: String, default: "" },

  // 📤 PARA NAMAN KAY ADMIN
  adminFileId: { type: String, default: "" },  
  adminFileName: { type: String, default: "" },      
  teacherPin: { type: String, default: "" }     
}, { timestamps: true }));

// 👥 SCHEMA: Para sa listahan ng mga Staff/Assistants
const Assistant = mongoose.model('Assistant', new mongoose.Schema({
  name: { type: String, required: true, unique: true }
}));

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

// ==================== STAFF/ASSISTANT ENDPOINTS ====================

// A. KUNIN ANG MGA STAFF (Para sa dropdown sa form at listahan sa modal)
app.get('/api/assistants', async (req, res) => {
  try {
    await connectDB();
    const list = await Assistant.find().sort({ name: 1 });
    const stringNames = list.map(ast => ast.name);
    res.status(200).json({ success: true, data: stringNames });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// B. MAGDAGDAG NG BAGONG STAFF
app.post('/api/assistants', checkAuth, async (req, res) => {
  try {
    await connectDB();
    const { name } = req.body;
    if (!name) return res.status(400).json({ success: false, message: "Pangalan ay kailangan." });

    const umiiral = await Assistant.findOne({ name });
    if (!umiiral) {
      await Assistant.create({ name });
    }

    const updatedList = await Assistant.find().sort({ name: 1 });
    res.status(200).json({ success: true, data: updatedList.map(ast => ast.name) });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// C. MAGTANGGAL NG STAFF MULA SA LISTAHAN
app.post('/api/assistants/remove', checkAuth, async (req, res) => {
  try {
    await connectDB();
    const { name } = req.body;
    
    await Assistant.deleteOne({ name });

    const updatedList = await Assistant.find().sort({ name: 1 });
    res.status(200).json({ success: true, data: updatedList.map(ast => ast.name) });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// ==================== TRANSACTION ENDPOINTS ====================

// 1. TEACHER SUBMIT REQUEST
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

    const pinalNaFileId = req.body.secureFileId || req.body.teacherAttachmentUrl || req.body.teacherFileId || "";
    const pinalNaFileName = req.body.fileName || req.body.teacherAttachmentName || req.body.teacherFileName || "";

    const transactionData = { 
      ...req.body, 
      equipmentName: finalEquipmentName,
      trackingNumber: pinalNaTracking, 
      createdAt: new Date(),
      
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

  // ==================== IMPORTS (Tiyaking nasa pinakataas ng server file mo ito kasama ng iba pang imports) ====================
const fs = require('fs');
const path = require('path');

// 3. MAG-UPDATE NG STATUS O EQUIPMENT RETURN (ADMIN ACTION) WITH AUTOMATED CSV LOGGING
// 3. MAG-UPDATE NG STATUS O EQUIPMENT RETURN (ADMIN ACTION) WITH FULL AUTOMATION
app.put('/api/transactions/:id', checkAuth, async (req, res) => {
  try {
    await connectDB();
    
    const kasalukuyangTx = await Transaction.findById(req.params.id);
    if (!kasalukuyangTx) {
      return res.status(404).json({ success: false, message: "Transaction not found" });
    }

    // DIRECT SPREAD: Saluhin LAHAT ng fields na galing sa frontend request nang walang naiiwan (Status at Returned fields)
    const updateData = { ...req.body };

    // AUTOMATION OVERRIDE: Kung pinindot ang "Mark as Returned", automatic magiging Done ang status
    if (req.body.equipmentReturned === true) {
      updateData.status = 'Done';
    }

    // Siguraduhing hindi mawawala ang mga existing files at fallbacks mo
    updateData.adminFileId = req.body.secureFileId || req.body.adminFileId || kasalukuyangTx.adminFileId || "";
    updateData.adminFileName = req.body.fileName || req.body.adminFileName || kasalukuyangTx.adminFileName || "";
    updateData.teacherPin = req.body.teacherPin || kasalukuyangTx.teacherPin || "";

    // 1. I-save nang buo sa MongoDB gamit ang atomic $set operator
    const updated = await Transaction.findByIdAndUpdate(
      req.params.id, 
      { $set: updateData }, 
      { new: true }
    );

    // 2. AUTOMATED CSV LOG WRITER (Philippine Time)
    if (req.body.equipmentReturned === true) {
      const kasalukuyangOras = new Date();
      const formattedDate = kasalukuyangOras.toLocaleString('en-US', { timeZone: 'Asia/Manila' });

      const logDir = path.join(__dirname, 'logs');
      if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir);
      }
      const csvFilePath = path.join(logDir, 'returned_items_log.csv');

      const kumpletongPangalan = `${updated.firstName} ${updated.middleName || ''} ${updated.lastName}`.trim().replace(/"/g, '""');
      const equipment = (updated.equipmentName || 'N/A').replace(/"/g, '""');
      const staffName = (updated.assistedBy || 'None').replace(/"/g, '""');
      const tracking = updated.trackingNumber;

      const csvRow = `"${tracking}","${kumpletongPangalan}","${equipment}","${staffName}","Naibalik Na","Done","${formattedDate}"\n`;

      if (!fs.existsSync(csvFilePath)) {
        const csvHeader = "Tracking No,Full Name,Equipment Name,Assisted By,Return Status,Action Status,Date and Time Returned\n";
        fs.writeFileSync(csvFilePath, csvHeader);
      }

      fs.appendFileSync(csvFilePath, csvRow);
      console.log(`📝 [CSV AUTOMATION SUCCESS]: Recorded for ${tracking}`);
    }

    // Ibalik ang pinakasariwang data sa iyong React Frontend
    res.status(200).json({ success: true, data: updated });

  } catch (error) {
    console.error("❌ Backend Update Error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// 4. DOWNLOAD ROUTE PARA KAY TEACHER
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

// 6. ADMIN CHANGE PIN
app.post('/api/admin/change-pin', checkAuth, async (req, res) => {
  try {
    await connectDB();
    const { newPin } = req.body;
    if (!newPin) return res.status(400).json({ success: false, message: "New PIN required" });

    await SystemConfig.findOneAndUpdate(
      { key: 'admin_config' },
      { $set: { adminPin: newPin } },
      { new: true, upsert: true }
    );

    res.status(200).json({ success: true, message: "PIN changed successfully" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));

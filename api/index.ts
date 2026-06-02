import express from "express";
import cors from "cors";
import { Pool } from "pg";
import dotenv from "dotenv";

dotenv.config();

const app = express();

app.use(express.json());
app.use(cors());

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,
  ssl: { rejectUnauthorized: false },
});

async function initDB() {
  if (!process.env.POSTGRES_URL) {
    console.warn("WARNING: POSTGRES_URL is not set.");
    return false;
  }
  
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS qrs (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        url TEXT NOT NULL,
        status TEXT DEFAULT 'Đang chạy',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS scans (
        id SERIAL PRIMARY KEY,
        qr_id INTEGER,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        ip_address TEXT,
        user_agent TEXT,
        FOREIGN KEY (qr_id) REFERENCES qrs (id) ON DELETE CASCADE
      );
    `);
    console.log("Database initialized successfully");
    return true;
  } catch (err) {
    console.error("Failed to initialize database:", err);
    return false;
  }
}

let dbInitPromise = initDB();

// API Routes
  
// Get all QRs with stats
app.get("/api/qr", async (req, res) => {
  try {
    await dbInitPromise;
    if (!process.env.POSTGRES_URL) {
      return res.status(503).json({ error: "Chưa cấu hình POSTGRES_URL." });
    }
    const { start, end } = req.query;
    const params: any[] = [];
    
    let queryStr = `
      SELECT q.id, q.name, q.url, q.status, q.created_at, COUNT(s.id) as scans 
      FROM qrs q 
      LEFT JOIN scans s ON q.id = s.qr_id 
    `;

    if (start && end) {
      queryStr += ` AND s.timestamp >= $1 AND s.timestamp <= $2::timestamp + interval '1 day' - interval '1 second' `;
      params.push(start, end);
    }
    
    queryStr += ` GROUP BY q.id, q.name, q.url, q.status, q.created_at ORDER BY q.created_at DESC`;

    const result = await pool.query(queryStr, params);
    res.json(result.rows);
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ error: err.message || "Internal Server Error" });
  }
});

// Get stats
app.get("/api/stats", async (req, res) => {
  try {
    await dbInitPromise;
    if (!process.env.POSTGRES_URL) {
      return res.status(503).json({ error: "Chưa cấu hình POSTGRES_URL." });
    }
    const { start, end } = req.query;
    const params: any[] = [];
    
    let dateFilterStr = "";
    if (start && end) {
      dateFilterStr = `WHERE timestamp >= $1 AND timestamp <= $2::timestamp + interval '1 day' - interval '1 second'`;
      params.push(start, end);
    }
    
    const runningQRsResult = await pool.query("SELECT COUNT(*) as count FROM qrs WHERE status = 'Đang chạy'");
    const runningQRs = parseInt(runningQRsResult.rows[0].count);
    
    const totalScansQuery = `SELECT COUNT(*) as count FROM scans ${dateFilterStr}`;
    const totalScansResult = await pool.query(totalScansQuery, params);
    const totalScans = parseInt(totalScansResult.rows[0].count);
    
    const scansTodayResult = await pool.query("SELECT COUNT(*) as count FROM scans WHERE DATE(timestamp) = CURRENT_DATE");
    const scansToday = parseInt(scansTodayResult.rows[0].count);
    
    const scansWeekResult = await pool.query("SELECT COUNT(*) as count FROM scans WHERE timestamp >= CURRENT_DATE - interval '7 days'");
    const scansWeek = parseInt(scansWeekResult.rows[0].count);

    let trendDateFilter = dateFilterStr ? dateFilterStr : "WHERE timestamp >= CURRENT_DATE - interval '7 days'";
    
    const trendQuery = `
      SELECT DATE(timestamp) as date, COUNT(*) as count 
      FROM scans 
      ${trendDateFilter}
      GROUP BY DATE(timestamp)
      ORDER BY date ASC
    `;
    const trendResult = await pool.query(trendQuery, params);

    res.json({
      runningQRs,
      totalScans,
      scansToday,
      scansWeek,
      trend: trendResult.rows
    });
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ error: err.message || "Internal Server Error" });
  }
});

// Create QR
app.post("/api/qr", async (req, res) => {
  try {
    await dbInitPromise;
    if (!process.env.POSTGRES_URL) {
      return res.status(503).json({ error: "Chưa cấu hình POSTGRES_URL. Vui lòng thêm biến môi trường POSTGRES_URL vào AI Studio hoặc Vercel." });
    }
    const { name, url } = req.body;
    if (!name || !url) {
      return res.status(400).json({ error: "Thieu name hoac url" });
    }
    
    const insertResult = await pool.query(
      'INSERT INTO qrs (name, url) VALUES ($1, $2) RETURNING id',
      [name, url]
    );
    
    const qrId = insertResult.rows[0].id;
    
    const qrResult = await pool.query(`
      SELECT q.id, q.name, q.url, q.status, q.created_at, 0 as scans 
      FROM qrs q 
      WHERE id = $1
    `, [qrId]);
    
    res.status(201).json(qrResult.rows[0]);
  } catch (err: any) {
    const errString = typeof err === 'object' ? JSON.stringify(err, Object.getOwnPropertyNames(err)) : String(err);
    console.error("Lỗi khi tạo QR:", err);
    res.status(500).json({ error: errString });
  }
});

// Update QR
app.put("/api/qr/:id", async (req, res) => {
  try {
    await dbInitPromise;
    if (!process.env.POSTGRES_URL) {
      return res.status(503).json({ error: "Chưa cấu hình POSTGRES_URL." });
    }
    const { id } = req.params;
    const { name, url, status } = req.body;
    
    const updates: string[] = [];
    const values: any[] = [];
    let paramCount = 1;
    
    if (name) {
      updates.push(`name = $${paramCount++}`);
      values.push(name);
    }
    if (url) {
      updates.push(`url = $${paramCount++}`);
      values.push(url);
    }
    if (status) {
      updates.push(`status = $${paramCount++}`);
      values.push(status);
    }
    
    if (updates.length > 0) {
      values.push(id);
      await pool.query(`UPDATE qrs SET ${updates.join(', ')} WHERE id = $${paramCount}`, values);
    }
    
    const qrResult = await pool.query(`
      SELECT q.id, q.name, q.url, q.status, q.created_at, COUNT(s.id) as scans 
      FROM qrs q 
      LEFT JOIN scans s ON q.id = s.qr_id 
      WHERE q.id = $1
      GROUP BY q.id, q.name, q.url, q.status, q.created_at
    `, [id]);
    
    res.json(qrResult.rows[0] || {});
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ error: err.message || "Internal Server Error" });
  }
});

// Delete QR
app.delete("/api/qr/:id", async (req, res) => {
  try {
    await dbInitPromise;
    if (!process.env.POSTGRES_URL) {
      return res.status(503).json({ error: "Chưa cấu hình POSTGRES_URL." });
    }
    const { id } = req.params;
    await pool.query('DELETE FROM qrs WHERE id = $1', [id]);
    res.json({ message: "Deleted successfully" });
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ error: err.message || "Internal Server Error" });
  }
});

// Redirect endpoint for QR code tracking
app.get("/go/:id", async (req, res) => {
  try {
    await dbInitPromise;
    if (!process.env.POSTGRES_URL) {
      return res.status(503).send("Chưa cấu hình POSTGRES_URL.");
    }
    const { id } = req.params;
    const qrResult = await pool.query('SELECT url, status FROM qrs WHERE id = $1', [id]);
    const qr = qrResult.rows[0];
    
    if (!qr) {
      return res.status(404).send("QR Not Found");
    }
    
    if (qr.status === 'Đã dừng') {
      return res.status(403).send("Mã QR này đang bị tạm dừng.");
    }
    
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    const userAgent = req.headers['user-agent'] || '';
    
    await pool.query(
      'INSERT INTO scans (qr_id, ip_address, user_agent) VALUES ($1, $2, $3)',
      [id, String(ip), String(userAgent)]
    );
    
    const destUrl = qr.url.startsWith('http') ? qr.url : `https://${qr.url}`;
    res.redirect(302, destUrl);
  } catch (err: any) {
    console.error(err);
    res.status(500).send("Internal Server Error");
  }
});

export default app;

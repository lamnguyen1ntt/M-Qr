import express from "express";
import cors from "cors";
import { sql } from "@vercel/postgres";
import dotenv from "dotenv";

dotenv.config();

const app = express();

app.use(express.json());
app.use(cors());

async function initDB() {
  if (!process.env.POSTGRES_URL) {
    console.warn("WARNING: POSTGRES_URL is not set.");
    return;
  }
  
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS qrs (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        url TEXT NOT NULL,
        status TEXT DEFAULT 'Đang chạy',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS scans (
        id SERIAL PRIMARY KEY,
        qr_id INTEGER,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        ip_address TEXT,
        user_agent TEXT,
        FOREIGN KEY (qr_id) REFERENCES qrs (id) ON DELETE CASCADE
      );
    `;
    console.log("Database initialized successfully");
    return true;
  } catch (err) {
    console.error("Failed to initialize database:", err);
    return false;
  }
}

// Invoke instantly so connection is ready for lambda
// But also track promise to await it in endpoints
let dbInitPromise = initDB();

// API Routes
  
// Get all QRs with stats
app.get("/api/qr", async (req, res) => {
  try {
    const isReady = await dbInitPromise;
    if (!process.env.POSTGRES_URL) {
      return res.status(503).json({ error: "Chưa cấu hình POSTGRES_URL." });
    }
    const { start, end } = req.query;
    
    let result;
    if (start && end) {
      result = await sql`
        SELECT q.id, q.name, q.url, q.status, q.created_at, COUNT(s.id) as scans 
        FROM qrs q 
        LEFT JOIN scans s ON q.id = s.qr_id AND s.timestamp >= ${start as string} AND s.timestamp <= ${end as string}::timestamp + interval '1 day' - interval '1 second'
        GROUP BY q.id, q.name, q.url, q.status, q.created_at 
        ORDER BY q.created_at DESC
      `;
    } else {
      result = await sql`
        SELECT q.id, q.name, q.url, q.status, q.created_at, COUNT(s.id) as scans 
        FROM qrs q 
        LEFT JOIN scans s ON q.id = s.qr_id
        GROUP BY q.id, q.name, q.url, q.status, q.created_at 
        ORDER BY q.created_at DESC
      `;
    }

    res.json(result.rows);
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ error: err.message || "Internal Server Error" });
  }
});

// Get stats
app.get("/api/stats", async (req, res) => {
  try {
    const isReady = await dbInitPromise;
    if (!process.env.POSTGRES_URL) {
      return res.status(503).json({ error: "Chưa cấu hình POSTGRES_URL." });
    }
    const { start, end } = req.query;
    
    const runningQRsResult = await sql`SELECT COUNT(*) as count FROM qrs WHERE status = 'Đang chạy'`;
    const runningQRs = parseInt(runningQRsResult.rows[0].count as string);
    
    let totalScansResult;
    if (start && end) {
      totalScansResult = await sql`SELECT COUNT(*) as count FROM scans WHERE timestamp >= ${start as string} AND timestamp <= ${end as string}::timestamp + interval '1 day' - interval '1 second'`;
    } else {
      totalScansResult = await sql`SELECT COUNT(*) as count FROM scans`;
    }
    const totalScans = parseInt(totalScansResult.rows[0].count as string);
    
    // scans today
    const scansTodayResult = await sql`SELECT COUNT(*) as count FROM scans WHERE DATE(timestamp) = CURRENT_DATE`;
    const scansToday = parseInt(scansTodayResult.rows[0].count as string);
    
    // scans this week
    const scansWeekResult = await sql`SELECT COUNT(*) as count FROM scans WHERE timestamp >= CURRENT_DATE - interval '7 days'`;
    const scansWeek = parseInt(scansWeekResult.rows[0].count as string);

    // trend for chart
    let trendResult;
    if (start && end) {
      trendResult = await sql`
        SELECT DATE(timestamp) as date, COUNT(*) as count 
        FROM scans 
        WHERE timestamp >= ${start as string} AND timestamp <= ${end as string}::timestamp + interval '1 day' - interval '1 second'
        GROUP BY DATE(timestamp)
        ORDER BY date ASC
      `;
    } else {
      trendResult = await sql`
        SELECT DATE(timestamp) as date, COUNT(*) as count 
        FROM scans 
        WHERE timestamp >= CURRENT_DATE - interval '7 days'
        GROUP BY DATE(timestamp)
        ORDER BY date ASC
      `;
    }

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
    const isReady = await dbInitPromise;
    if (!process.env.POSTGRES_URL) {
      return res.status(503).json({ error: "Chưa cấu hình POSTGRES_URL. Vui lòng thêm biến môi trường POSTGRES_URL vào AI Studio hoặc Vercel." });
    }
    const { name, url } = req.body;
    if (!name || !url) {
      return res.status(400).json({ error: "Thieu name hoac url" });
    }
    
    const insertResult = await sql`
      INSERT INTO qrs (name, url) VALUES (${name}, ${url}) RETURNING id
    `;
    
    const qrId = insertResult.rows[0].id;
    
    const qrResult = await sql`
      SELECT q.id, q.name, q.url, q.status, q.created_at, 0 as scans 
      FROM qrs q 
      WHERE id = ${qrId}
    `;
    
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
    const isReady = await dbInitPromise;
    if (!process.env.POSTGRES_URL) {
      return res.status(503).json({ error: "Chưa cấu hình POSTGRES_URL." });
    }
    const { id } = req.params;
    const { name, url, status } = req.body;
    
    if (name && url && status) {
       await sql`
        UPDATE qrs 
        SET name = ${name}, url = ${url}, status = ${status}
        WHERE id = ${id}
      `;
    } else if (status) {
       await sql`UPDATE qrs SET status = ${status} WHERE id = ${id}`;
    } else if (name && url) {
       await sql`UPDATE qrs SET name = ${name}, url = ${url} WHERE id = ${id}`;
    }
    
    const qrResult = await sql`
      SELECT q.id, q.name, q.url, q.status, q.created_at, COUNT(s.id) as scans 
      FROM qrs q 
      LEFT JOIN scans s ON q.id = s.qr_id 
      WHERE q.id = ${id}
      GROUP BY q.id, q.name, q.url, q.status, q.created_at
    `;
    
    res.json(qrResult.rows[0] || {});
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ error: err.message || "Internal Server Error" });
  }
});

// Delete QR
app.delete("/api/qr/:id", async (req, res) => {
  try {
    const isReady = await dbInitPromise;
    if (!process.env.POSTGRES_URL) {
      return res.status(503).json({ error: "Chưa cấu hình POSTGRES_URL." });
    }
    const { id } = req.params;
    await sql`DELETE FROM qrs WHERE id = ${id}`;
    res.json({ message: "Deleted successfully" });
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ error: err.message || "Internal Server Error" });
  }
});

// Redirect endpoint for QR code tracking
app.get("/go/:id", async (req, res) => {
  try {
    const isReady = await dbInitPromise;
    if (!process.env.POSTGRES_URL) {
      return res.status(503).send("Chưa cấu hình POSTGRES_URL.");
    }
    const { id } = req.params;
    const qrResult = await sql`SELECT url, status FROM qrs WHERE id = ${id}`;
    const qr = qrResult.rows[0];
    
    if (!qr) {
      return res.status(404).send("QR Not Found");
    }
    
    if (qr.status === 'Đã dừng') {
      return res.status(403).send("Mã QR này đang bị tạm dừng.");
    }
    
    // Log the scan
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    const userAgent = req.headers['user-agent'] || '';
    
    await sql`
      INSERT INTO scans (qr_id, ip_address, user_agent) VALUES (${id}, ${String(ip)}, ${String(userAgent)})
    `;
    
    // Redirect
    const destUrl = qr.url.startsWith('http') ? qr.url : `https://${qr.url}`;
    res.redirect(302, destUrl);
  } catch (err: any) {
    console.error(err);
    res.status(500).send("Internal Server Error");
  }
});

export default app;

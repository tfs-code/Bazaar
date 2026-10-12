require("dotenv").config();
const db = require("./db");

const express = require("express");
const productsRouter = require("./routes/products");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

app.use("/products", productsRouter);

app.get("/", (req, res) => {
    res.json({ message: "Bazaar API is running" });
});

app.get("/health", (req, res) => {
    res.json({ status: "ok", uptime: process.uptime() });
});

app.get("/db-check", async (req, res) => {
    try {
        const result = await db.query("SELECT NOW()");
        res.json({ time: result.rows[0].now });
    } catch (err) {
        res.status(500).json({ error: "database unreachable" });
    }
});

app.listen(PORT, () => {
    console.log(`Listening on http://localhost:${PORT}`);
});

require("dotenv").config();
const db = require("./db");

const express = require("express");

const app = express();
const PORT = process.env.PORT || 3000;

const session = require("express-session");
const passport = require("./auth/passport");
const authRouter = require("./routes/auth");
const cartRouter = require("./routes/cart");
const ordersRouter = require("./routes/orders");

app.use(express.json());

app.use(
    session({
        secret: process.env.SESSION_SECRET,
        resave: false,
        saveUninitialized: false,
        cookie: {
            httpOnly: true,
            sameSite: "lax",
            maxAge: 1000 * 60 * 60 * 24,
        },
    }),
);

app.use(passport.initialize());
app.use(passport.session());

app.use("/auth", authRouter);
app.use("/cart", cartRouter);
app.use("/orders", ordersRouter);

const productsRouter = require("./routes/products");
app.use("/products", productsRouter);

const usersRouter = require("./routes/users");
app.use("/users", usersRouter);

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

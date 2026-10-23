const express = require("express");
const db = require("../db");
const ensureLoggedIn = require("../middleware/ensureLoggedIn");

const router = express.Router();

const MAX_PG_INT = 2147483647;
const ALLOWED_STATUSES = ["pending", "paid", "shipped", "cancelled"];

function validateId(req, res, next) {
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id < 1 || id > MAX_PG_INT) {
        return res
            .status(400)
            .json({ error: "Order id must be a positive integer" });
    }

    req.orderId = id;
    next();
}

router.get("/", ensureLoggedIn, async (req, res) => {
    try {
        const result = await db.query(
            `SELECT id, total_cents, status, created_at
             FROM orders
             WHERE user_id = $1
             ORDER BY created_at DESC, id DESC`,
            [req.user.id],
        );

        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Could not fetch orders" });
    }
});

router.get("/:id", ensureLoggedIn, validateId, async (req, res) => {
    try {
        const orderResult = await db.query(
            `SELECT id, total_cents, status, created_at
             FROM orders
             WHERE id = $1 AND user_id = $2`,
            [req.orderId, req.user.id],
        );

        if (orderResult.rows.length === 0) {
            return res.status(404).json({ error: "Order not found" });
        }

        const itemsResult = await db.query(
            `SELECT
                 oi.product_id,
                 p.name,
                 oi.quantity,
                 oi.unit_price_cents,
                 oi.quantity * oi.unit_price_cents AS line_total_cents
             FROM order_items oi
             JOIN products p ON p.id = oi.product_id
             WHERE oi.order_id = $1
             ORDER BY p.name`,
            [req.orderId],
        );

        res.json({ ...orderResult.rows[0], items: itemsResult.rows });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Could not fetch order" });
    }
});

router.post("/", ensureLoggedIn, async (req, res) => {
    const client = await db.getClient();

    try {
        await client.query("BEGIN");

        const cartResult = await client.query(
            `SELECT ci.product_id, ci.quantity, p.name, p.price_cents, p.stock
             FROM cart_items ci
             JOIN products p ON p.id = ci.product_id
             JOIN carts c ON c.id = ci.cart_id
             WHERE c.user_id = $1
             ORDER BY ci.product_id
             FOR UPDATE OF p`,
            [req.user.id],
        );

        const lines = cartResult.rows;

        if (lines.length === 0) {
            await client.query("ROLLBACK");
            return res.status(400).json({ error: "Cart is empty" });
        }

        const short = lines.find((line) => line.quantity > line.stock);

        if (short) {
            await client.query("ROLLBACK");
            return res.status(409).json({
                error: `Only ${short.stock} of "${short.name}" left in stock`,
            });
        }

        const totalCents = lines.reduce(
            (sum, line) => sum + line.quantity * line.price_cents,
            0,
        );

        const orderResult = await client.query(
            `INSERT INTO orders (user_id, total_cents)
             VALUES ($1, $2)
             RETURNING id, total_cents, status, created_at`,
            [req.user.id, totalCents],
        );

        const order = orderResult.rows[0];

        await client.query(
            `INSERT INTO order_items (order_id, product_id, quantity, unit_price_cents)
             SELECT $1, ci.product_id, ci.quantity, p.price_cents
             FROM cart_items ci
             JOIN products p ON p.id = ci.product_id
             JOIN carts c ON c.id = ci.cart_id
             WHERE c.user_id = $2`,
            [order.id, req.user.id],
        );

        await client.query(
            `UPDATE products p
             SET stock = p.stock - ci.quantity
             FROM cart_items ci
             JOIN carts c ON c.id = ci.cart_id
             WHERE c.user_id = $1 AND p.id = ci.product_id`,
            [req.user.id],
        );

        await client.query(
            `DELETE FROM cart_items
             WHERE cart_id IN (SELECT id FROM carts WHERE user_id = $1)`,
            [req.user.id],
        );

        await client.query("COMMIT");

        res.status(201).json({ ...order, item_count: lines.length });
    } catch (err) {
        try {
            await client.query("ROLLBACK");
        } catch (rollbackErr) {
            console.error(rollbackErr);
        }

        console.error(err);
        res.status(500).json({ error: "Could not place order" });
    } finally {
        client.release();
    }
});

router.put("/:id", ensureLoggedIn, validateId, async (req, res) => {
    const { status } = req.body;

    if (!ALLOWED_STATUSES.includes(status)) {
        return res.status(400).json({
            error: `status must be one of: ${ALLOWED_STATUSES.join(", ")}`,
        });
    }

    try {
        const result = await db.query(
            `UPDATE orders
             SET status = $1
             WHERE id = $2 AND user_id = $3
             RETURNING id, total_cents, status, created_at`,
            [status, req.orderId, req.user.id],
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: "Order not found" });
        }

        res.json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Could not update order" });
    }
});

router.delete("/:id", ensureLoggedIn, validateId, async (req, res) => {
    const client = await db.getClient();

    try {
        await client.query("BEGIN");

        const owned = await client.query(
            `SELECT id FROM orders
             WHERE id = $1 AND user_id = $2
             FOR UPDATE`,
            [req.orderId, req.user.id],
        );

        if (owned.rows.length === 0) {
            await client.query("ROLLBACK");
            return res.status(404).json({ error: "Order not found" });
        }

        await client.query(
            `UPDATE products p
             SET stock = p.stock + oi.quantity
             FROM order_items oi
             WHERE oi.order_id = $1 AND p.id = oi.product_id`,
            [req.orderId],
        );

        await client.query("DELETE FROM orders WHERE id = $1", [req.orderId]);

        await client.query("COMMIT");

        res.status(204).end();
    } catch (err) {
        try {
            await client.query("ROLLBACK");
        } catch (rollbackErr) {
            console.error(rollbackErr);
        }

        console.error(err);
        res.status(500).json({ error: "Could not delete order" });
    } finally {
        client.release();
    }
});

module.exports = router;

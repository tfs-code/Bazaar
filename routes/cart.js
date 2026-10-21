const express = require("express");
const db = require("../db");
const ensureLoggedIn = require("../middleware/ensureLoggedIn");

const router = express.Router();

async function getOrCreateCart(userId) {
    const result = await db.query(
        `INSERT INTO carts (user_id)
         VALUES ($1)
         ON CONFLICT (user_id) DO UPDATE SET user_id = EXCLUDED.user_id
         RETURNING id`,
        [userId],
    );

    return result.rows[0].id;
}

router.get("/", ensureLoggedIn, async (req, res) => {
    try {
        const cartId = await getOrCreateCart(req.user.id);

        const result = await db.query(
            `SELECT
                 ci.product_id,
                 p.name,
                 p.price_cents,
                 ci.quantity,
                 ci.quantity * p.price_cents AS line_total_cents
             FROM cart_items ci
             JOIN products p ON p.id = ci.product_id
             WHERE ci.cart_id = $1
             ORDER BY p.name`,
            [cartId],
        );

        const totalCents = result.rows.reduce(
            (sum, row) => sum + row.line_total_cents,
            0,
        );

        res.json({
            cart_id: cartId,
            items: result.rows,
            total_cents: totalCents,
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Could not fetch cart" });
    }
});

module.exports = router;

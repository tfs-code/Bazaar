const express = require("express");
const db = require("../db");
const ensureLoggedIn = require("../middleware/ensureLoggedIn");

const router = express.Router();

const MAX_PG_INT = 2147483647;

function validateProductId(req, res, next) {
    const id = Number(req.params.productId);

    if (!Number.isInteger(id) || id < 1 || id > MAX_PG_INT) {
        return res
            .status(400)
            .json({ error: "Product id must be a positive integer" });
    }

    req.productId = id;
    next();
}

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

router.post("/items", ensureLoggedIn, async (req, res) => {
    const { product_id } = req.body;
    const quantity = req.body.quantity ?? 1;

    if (!Number.isInteger(product_id) || product_id < 1) {
        return res
            .status(400)
            .json({ error: "product_id must be a positive integer" });
    }

    if (!Number.isInteger(quantity) || quantity < 1) {
        return res
            .status(400)
            .json({ error: "quantity must be a positive integer" });
    }

    try {
        const cartId = await getOrCreateCart(req.user.id);

        const result = await db.query(
            `INSERT INTO cart_items (cart_id, product_id, quantity)
             VALUES ($1, $2, $3)
             ON CONFLICT (cart_id, product_id)
             DO UPDATE SET quantity = cart_items.quantity + EXCLUDED.quantity
             RETURNING *`,
            [cartId, product_id, quantity],
        );

        res.status(201).json(result.rows[0]);
    } catch (err) {
        if (err.code === "23503") {
            return res.status(404).json({ error: "Product not found" });
        }

        console.error(err);
        res.status(500).json({ error: "Could not add to cart" });
    }
});

router.put(
    "/items/:productId",
    ensureLoggedIn,
    validateProductId,
    async (req, res) => {
        const { quantity } = req.body;

        if (!Number.isInteger(quantity) || quantity < 1) {
            return res
                .status(400)
                .json({ error: "quantity must be a positive integer" });
        }

        try {
            const cartId = await getOrCreateCart(req.user.id);

            const result = await db.query(
                `UPDATE cart_items
                 SET quantity = $1
                 WHERE cart_id = $2 AND product_id = $3
                 RETURNING *`,
                [quantity, cartId, req.productId],
            );

            if (result.rows.length === 0) {
                return res.status(404).json({ error: "Product not in cart" });
            }

            res.json(result.rows[0]);
        } catch (err) {
            console.error(err);
            res.status(500).json({ error: "Could not update cart item" });
        }
    },
);

router.delete(
    "/items/:productId",
    ensureLoggedIn,
    validateProductId,
    async (req, res) => {
        try {
            const cartId = await getOrCreateCart(req.user.id);

            const result = await db.query(
                `DELETE FROM cart_items
                 WHERE cart_id = $1 AND product_id = $2
                 RETURNING product_id`,
                [cartId, req.productId],
            );

            if (result.rows.length === 0) {
                return res.status(404).json({ error: "Product not in cart" });
            }

            res.status(204).end();
        } catch (err) {
            console.error(err);
            res.status(500).json({ error: "Could not remove cart item" });
        }
    },
);

router.delete("/", ensureLoggedIn, async (req, res) => {
    try {
        const cartId = await getOrCreateCart(req.user.id);

        await db.query("DELETE FROM cart_items WHERE cart_id = $1", [cartId]);

        res.status(204).end();
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Could not empty cart" });
    }
});

module.exports = router;

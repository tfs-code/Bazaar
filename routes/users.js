const express = require("express");
const bcrypt = require("bcrypt");
const db = require("../db");
const ensureLoggedIn = require("../middleware/ensureLoggedIn");

const router = express.Router();

const MAX_PG_INT = 2147483647;

function validateId(req, res, next) {
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id < 1 || id > MAX_PG_INT) {
        return res
            .status(400)
            .json({ error: "User id must be a positive integer" });
    }
    req.userId = id;
    next();
}

function ensureSelf(req, res, next) {
    if (req.user.id !== req.userId) {
        return res
            .status(403)
            .json({ error: "You can only manage your own account" });
    }

    next();
}

const SALT_ROUNDS = 12;

function validateCredentials(body) {
    const { email, password } = body;

    if (
        typeof email !== "string" ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    ) {
        return "a valid email is required";
    }

    if (typeof password !== "string" || password.length < 8) {
        return "password must be at least 8 characters";
    }

    if (password.length > 72) {
        return "password must be 72 characters or fewer";
    }

    return null;
}

router.post("/", async (req, res) => {
    const problem = validateCredentials(req.body);

    if (problem) {
        return res.status(400).json({ error: problem });
    }

    const { email, password } = req.body;

    try {
        const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

        const result = await db.query(
            `INSERT INTO users (email, password_hash)
       VALUES ($1, $2)
       RETURNING id, email, created_at`,
            [email.trim().toLowerCase(), passwordHash],
        );

        res.status(201).json(result.rows[0]);
    } catch (err) {
        if (err.code === "23505") {
            return res
                .status(409)
                .json({ error: "That email is already registered" });
        }

        console.error(err);
        res.status(500).json({ error: "Could not create user" });
    }
});

router.get("/:id", validateId, ensureLoggedIn, ensureSelf, async (req, res) => {
    try {
        const result = await db.query(
            "SELECT id, email, created_at FROM users WHERE id = $1",
            [req.userId],
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ error: "User not found" });
        }
        res.json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Could not fetch user" });
    }
});

router.put("/:id", validateId, ensureLoggedIn, ensureSelf, async (req, res) => {
    const problem = validateCredentials(req.body);

    if (problem) {
        return res.status(400).json({ error: problem });
    }

    const { email, password } = req.body;

    try {
        const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
        const result = await db.query(
            `UPDATE users
            SET email = $1, password_hash = $2
            WHERE id = $3
            RETURNING id, email, created_at`,
            [email.trim().toLowerCase(), passwordHash, req.userId],
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ error: "User not found" });
        }

        res.json(result.rows[0]);
    } catch (err) {
        if (err.code === "23505") {
            return res
                .status(409)
                .json({ error: "That email is already registered" });
        }

        console.error(err);
        res.status(500).json({ error: "Could not update user" });
    }
});

router.delete("/:id", validateId, ensureLoggedIn, ensureSelf, async (req, res) => {
    try {
        const result = await db.query(
            `
            DELETE
            FROM users 
            WHERE id = $1 
            RETURNING id`,
            [req.userId],
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ error: "User not found" });
        }
        res.status(204).end();
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Could not delete user" });
    }
});

module.exports = router;

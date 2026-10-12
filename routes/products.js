const express = require('express');
const db = require('../db');

const router = express.Router();

function validateId(req, res, next) {
  const id = Number(req.params.id);

  if (!Number.isInteger(id) || id < 1) {
    return res.status(400).json({ error: 'Product id must be a positive integer' });
  }

  req.productId = id;
  next();
}

function validateProductBody(body) {
  const { name, price_cents, stock } = body;

  if (typeof name !== 'string' || name.trim() === '') {
    return 'name is required';
  }

  if (!Number.isInteger(price_cents) || price_cents < 0) {
    return 'price_cents must be a non-negative integer';
  }

  if (stock !== undefined && (!Number.isInteger(stock) || stock < 0)) {
    return 'stock must be a non-negative integer';
  }

  return null;
}

router.get('/', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM products ORDER BY id');
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not fetch products' });
  }
});

router.get('/:id', validateId, async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM products WHERE id = $1', [req.productId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not fetch product' });
  }
});

router.post('/', async (req, res) => {
  const problem = validateProductBody(req.body);

  if (problem) {
    return res.status(400).json({ error: problem });
  }

  const { name, description, price_cents, stock } = req.body;

  try {
    const result = await db.query(
      `INSERT INTO products (name, description, price_cents, stock)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [name.trim(), description ?? null, price_cents, stock ?? 0]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not create product' });
  }
});

router.put('/:id', validateId, async (req, res) => {
  const problem = validateProductBody(req.body);

  if (problem) {
    return res.status(400).json({ error: problem });
  }

  const { name, description, price_cents, stock } = req.body;

  try {
    const result = await db.query(
      `UPDATE products
       SET name = $1, description = $2, price_cents = $3, stock = $4
       WHERE id = $5
       RETURNING *`,
      [name.trim(), description ?? null, price_cents, stock ?? 0, req.productId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not update product' });
  }
});

router.delete('/:id', validateId, async (req, res) => {
  try {
    const result = await db.query(
      'DELETE FROM products WHERE id = $1 RETURNING id',
      [req.productId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }

    res.status(204).end();
  } catch (err) {
    if (err.code === '23503') {
      return res.status(409).json({
        error: 'Product appears in existing orders and cannot be deleted',
      });
    }

    console.error(err);
    res.status(500).json({ error: 'Could not delete product' });
  }
});

module.exports = router;

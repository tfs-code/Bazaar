const express = require("express");
const passport = require("../auth/passport");

const router = express.Router();

router.post("/login", (req, res, next) => {
    passport.authenticate("local", (err, user, info) => {
        if (err) {
            return next(err);
        }

        if (!user) {
            return res
                .status(401)
                .json({ error: info?.message ?? "Login failed" });
        }

        req.login(user, (loginErr) => {
            if (loginErr) {
                return next(loginErr);
            }

            res.json({ id: user.id, email: user.email });
        });
    })(req, res, next);
});

router.get("/me", (req, res) => {
    if (!req.isAuthenticated()) {
        return res.status(401).json({ error: "Not logged in" });
    }
    res.json(req.user);
});

router.post("/logout", (req, res, next) => {
    req.logout((err) => {
        if (err) {
            return next(err);
        }

        req.session.destroy((destroyErr) => {
            if (destroyErr) {
                return next(destroyErr);
            }

            res.clearCookie("connect.sid").status(204).end();
        });
    });
});

module.exports = router;

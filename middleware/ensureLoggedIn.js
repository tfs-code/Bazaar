function ensureLoggedIn(req, res, next) {
    if (!req.isAuthenticated()) {
        return res.status(401).json({ error: "You must be logged in" });
    }

    next();
}

module.exports = ensureLoggedIn;

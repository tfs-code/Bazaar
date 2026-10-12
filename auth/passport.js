const passport = require("passport");
const LocalStrategy = require("passport-local").Strategy;
const bcrypt = require("bcrypt");
const db = require("../db");

passport.use(
    new LocalStrategy(
        { usernameField: "email" },
        async (email, password, done) => {
            try {
                const result = await db.query(
                    "SELECT id, email, password_hash FROM users WHERE email = $1",
                    [email.trim().toLowerCase()],
                );

                const user = result.rows[0];

                if (!user) {
                    return done(null, false, {
                        message: "Incorrect email or password",
                    });
                }

                const matches = await bcrypt.compare(
                    password,
                    user.password_hash,
                );

                if (!matches) {
                    return done(null, false, {
                        message: "Incorrect email or password",
                    });
                }

                done(null, { id: user.id, email: user.email });
            } catch (err) {
                done(err);
            }
        },
    ),
);

passport.serializeUser((user, done) => {
    done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
    try {
        const result = await db.query(
            "SELECT id, email, created_at FROM users WHERE id = $1",
            [id],
        );

        done(null, result.rows[0] ?? false);
    } catch (err) {
        done(err);
    }
});

module.exports = passport;

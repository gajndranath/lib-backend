import express from "express";
import mongoSanitize from "express-mongo-sanitize";

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use((req, res, next) => {
    try {
        // Sanitize body and params (usually writable)
        if (req.body) req.body = mongoSanitize.sanitize(req.body);
        if (req.params) req.params = mongoSanitize.sanitize(req.params);
        
        // Sanitize query in-place because req.query is a getter in Express 5
        if (req.query) {
            const sanitizedQuery = mongoSanitize.sanitize(req.query);
            // If sanitizedQuery is different object, copy props back
            if (sanitizedQuery !== req.query) {
                // Clear existing keys
                for (const key in req.query) {
                    delete req.query[key];
                }
                // Assign sanitized keys
                Object.assign(req.query, sanitizedQuery);
            }
        }
        next();
    } catch (err) {
        console.error("Caught error in CUSTOM sanitize:", err.message);
        res.status(500).json({ error: err.message });
    }
});

app.post("/login", (req, res) => {
    res.json({ success: true });
});

const PORT = 3002;
app.listen(PORT, () => {
    console.log(`Repro server running on port ${PORT}`);
});

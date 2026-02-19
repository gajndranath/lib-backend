import { Resend } from 'resend';

// Sirf instance export karein
const resend = new Resend(process.env.RESEND_API_KEY || 're_XQ7tyckV_8DJvZoQi9cDXZUeSKMapbqUi');

export default resend;
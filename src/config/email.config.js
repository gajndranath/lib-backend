import { Resend } from 'resend';

// API Key ko initialize karein
const resend = new Resend(process.env.RESEND_API_KEY || 're_XQ7tyckV_8DJvZoQi9cDXZUeSKMapbqUi');

export default resend;
const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');

dotenv.config();

const app = require('./src/app');

const port = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`📡 Environment: ${process.env.NODE_ENV || 'development'}`);
})
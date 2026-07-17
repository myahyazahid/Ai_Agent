const express = require('express');
const app = express();
app.use(express.json());

app.post('/login', (req, res) => {
  const { username, password } = req.body;
  // Add authentication logic here
  if (username === 'admin' && password === 'password') {
    return res.status(200).json({ message: 'Login successful' });
  }
  res.status(401).json({ error: 'Invalid credentials' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

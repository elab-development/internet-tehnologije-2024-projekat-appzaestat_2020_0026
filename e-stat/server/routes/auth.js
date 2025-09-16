import { Router } from 'express';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';

const router = Router();

router.post('/register', async (req, res) => {
  try {
    const { email, password, name } = req.body;
    if (!email || !password || !name)
      return res.status(400).json({ message: 'Missing fields' });

    const exists = await User.findOne({ email });
    if (exists) return res.status(409).json({ message: 'Email in use' });

    const user = await User.create({ email, password, name });
    return res
      .status(201)
      .json({ id: user._id, email: user.email, name: user.name });
  } catch (e) {
    return res.status(500).json({ message: e.message });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user || !(await user.comparePassword(password)))
      return res.status(401).json({ message: 'Invalid credentials' });

    const token = jwt.sign(
      { id: user._id, email: user.email },
      process.env.JWT_SECRET,
      {
        expiresIn: '7d',
      }
    );
    return res.json({
      token,
      user: { id: user._id, email: user.email, name: user.name },
    });
  } catch (e) {
    return res.status(500).json({ message: e.message });
  }
});

export default router;

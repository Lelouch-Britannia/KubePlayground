import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import LearningUnit from './pages/LearningUnit';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/unit/:slug" element={<LearningUnit />} />
      </Routes>
    </BrowserRouter>
  );
}

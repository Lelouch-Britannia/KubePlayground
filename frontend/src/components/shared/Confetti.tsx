import React, { useEffect, useState } from 'react';

interface ConfettiProps {
  duration?: number;
}

interface Particle {
  id: number;
  x: number;
  y: number;
  rotation: number;
  color: string;
  size: number;
  velocity: {
    x: number;
    y: number;
    rotation: number;
  };
}

export const Confetti: React.FC<ConfettiProps> = ({ duration = 3000 }) => {
  const [particles, setParticles] = useState<Particle[]>([]);

  useEffect(() => {
    const colors = ['#50fa7b', '#bd93f9', '#ff79c6', '#f1fa8c', '#8be9fd', '#ffb86c'];
    const particleCount = 50;

    const newParticles: Particle[] = Array.from({ length: particleCount }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      y: -10,
      rotation: Math.random() * 360,
      color: colors[Math.floor(Math.random() * colors.length)],
      size: Math.random() * 10 + 5,
      velocity: {
        x: (Math.random() - 0.5) * 2,
        y: Math.random() * 3 + 2,
        rotation: (Math.random() - 0.5) * 10,
      },
    }));

    setParticles(newParticles);

    const timer = setTimeout(() => {
      setParticles([]);
    }, duration);

    return () => clearTimeout(timer);
  }, [duration]);

  return (
    <div className="fixed inset-0 pointer-events-none z-[100] overflow-hidden">
      {particles.map((particle) => (
        <div
          key={particle.id}
          className="absolute animate-confetti"
          style={{
            left: `${particle.x}%`,
            top: `${particle.y}%`,
            width: `${particle.size}px`,
            height: `${particle.size}px`,
            backgroundColor: particle.color,
            transform: `rotate(${particle.rotation}deg)`,
            borderRadius: Math.random() > 0.5 ? '50%' : '0',
            '--fall-duration': `${2 + Math.random()}s`,
            '--drift': `${particle.velocity.x * 50}px`,
            '--rotation-speed': `${particle.velocity.rotation}deg`,
          } as React.CSSProperties}
        />
      ))}

      <style>{`
        @keyframes confetti-fall {
          0% {
            transform: translateY(0) translateX(0) rotate(0deg);
            opacity: 1;
          }
          100% {
            transform: translateY(100vh) translateX(var(--drift)) rotate(calc(var(--rotation-speed) * 10));
            opacity: 0;
          }
        }

        .animate-confetti {
          animation: confetti-fall var(--fall-duration) ease-in forwards;
        }
      `}</style>
    </div>
  );
};

export default Confetti;

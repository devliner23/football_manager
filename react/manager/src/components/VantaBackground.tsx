import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import HALO from 'vanta/dist/vanta.halo.min';

const VantaBackground = () => {
  const vantaRef = useRef<HTMLDivElement>(null);
  const effectRef = useRef<any>(null);

  useEffect(() => {
    if (vantaRef.current && !effectRef.current) {
      effectRef.current = HALO({
        el: vantaRef.current,
        THREE,
        mouseControls: true,
        touchControls: true,
        backgroundColor: 0x0a0e1a,
        color: 0x00d4ff,
        color2: 0x7b2ffc
      });
    }

    return () => {
      if (effectRef.current) {
        effectRef.current.destroy();
      }
    };
  }, []);

  return <div className="vanta-background" ref={vantaRef} />;
};

export default VantaBackground;
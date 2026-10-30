type ToastType = 'info' | 'error' | 'success' | 'warning';

interface ToastEvent {
  message: string;
  type: ToastType;
}

type Listener = (toast: ToastEvent) => void;

let listeners: Listener[] = [];

const playNotificationSound = (type: ToastType) => {
  try {
    const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc.connect(gain);
    gain.connect(ctx.destination);
    
    const now = ctx.currentTime;
    
    if (type === 'success') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(523.25, now); // C5
      osc.frequency.setValueAtTime(783.99, now + 0.1); // G5
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.3, now + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
      osc.start(now);
      osc.stop(now + 0.3);
    } else if (type === 'error') {
      osc.type = 'square';
      osc.frequency.setValueAtTime(150, now);
      osc.frequency.setValueAtTime(100, now + 0.15);
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.15, now + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
      osc.start(now);
      osc.stop(now + 0.3);
    } else if (type === 'warning') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(440, now);
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.2, now + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
      osc.start(now);
      osc.stop(now + 0.2);
    } else {
      // info
      osc.type = 'sine';
      osc.frequency.setValueAtTime(600, now);
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.2, now + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
      osc.start(now);
      osc.stop(now + 0.15);
    }
  } catch (e) {
    // Ignore audio context errors (e.g. if user hasn't interacted with document yet)
    console.warn("Could not play notification sound", e);
  }
};

export const globalToast = {
  show: (message: string, type: ToastType = 'info') => {
    playNotificationSound(type);
    listeners.forEach(listener => listener({ message, type }));
  },
  error: (message: string) => {
    playNotificationSound('error');
    listeners.forEach(listener => listener({ message, type: 'error' }));
  },
  warning: (message: string) => {
    playNotificationSound('warning');
    listeners.forEach(listener => listener({ message, type: 'warning' }));
  },
  success: (message: string) => {
    playNotificationSound('success');
    listeners.forEach(listener => listener({ message, type: 'success' }));
  },
  info: (message: string) => {
    playNotificationSound('info');
    listeners.forEach(listener => listener({ message, type: 'info' }));
  },
  subscribe: (listener: Listener) => {
    listeners.push(listener);
    return () => {
      listeners = listeners.filter(l => l !== listener);
    };
  }
};

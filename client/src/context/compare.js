import { create } from 'zustand';

export const useCompareStore = create((set, get) => ({
  colleges: [],
  addCollege:    (c) => set(s => s.colleges.length < 3 ? { colleges: [...s.colleges, c] } : s),
  removeCollege: (id) => set(s => ({ colleges: s.colleges.filter(c => c.id !== id) })),
  clear:         ()   => set({ colleges: [] }),
  isSelected:    (id) => get().colleges.some(c => c.id === id),
}));

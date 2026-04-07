import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const useStudentStore = create(
  persist(
    (set) => ({
      token:   null,
      student: null,
      login:   (token, student) => set({ token, student }),
      logout:  () => set({ token: null, student: null }),
    }),
    { name: 'cs-student' }
  )
);

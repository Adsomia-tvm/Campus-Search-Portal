/**
 * Integration tests for Zod validation middleware.
 * Tests that invalid payloads are rejected with structured error responses.
 */

const { describe, it, expect } = require('vitest');

// Import schemas directly for unit-level validation tests
const {
  adminLogin, studentAuth, createCollege, createEnquiry, publicEnquiry, createStudent,
  createUser, careerLead,
} = require('../src/middleware/schemas');

describe('Zod Schemas', () => {
  describe('adminLogin', () => {
    it('rejects missing email', () => {
      const result = adminLogin.safeParse({ body: { password: 'test123456' } });
      expect(result.success).toBe(false);
    });

    it('rejects short password', () => {
      const result = adminLogin.safeParse({ body: { email: 'a@b.com', password: '12345' } });
      expect(result.success).toBe(false);
    });

    it('accepts valid login', () => {
      const result = adminLogin.safeParse({ body: { email: 'admin@test.com', password: '123456' } });
      expect(result.success).toBe(true);
    });
  });

  describe('studentAuth', () => {
    it('rejects invalid Indian phone number', () => {
      const result = studentAuth.safeParse({
        body: { name: 'Test', phone: '1234567890' }, // starts with 1
      });
      expect(result.success).toBe(false);
    });

    it('accepts valid Indian phone', () => {
      const result = studentAuth.safeParse({
        body: { name: 'Rahul Kumar', phone: '9876543210' },
      });
      expect(result.success).toBe(true);
    });

    it('rejects short name', () => {
      const result = studentAuth.safeParse({
        body: { name: 'R', phone: '9876543210' },
      });
      expect(result.success).toBe(false);
    });
  });

  describe('createCollege', () => {
    it('rejects empty name', () => {
      const result = createCollege.safeParse({ body: { name: '' } });
      expect(result.success).toBe(false);
    });

    it('accepts minimal college', () => {
      const result = createCollege.safeParse({ body: { name: 'Test Medical College' } });
      expect(result.success).toBe(true);
    });

    it('rejects invalid website URL', () => {
      const result = createCollege.safeParse({ body: { name: 'Test', website: 'not-a-url' } });
      expect(result.success).toBe(false);
    });

    it('accepts college with all fields', () => {
      const result = createCollege.safeParse({
        body: {
          name: 'ABC Medical College',
          city: 'Bangalore',
          state: 'Karnataka',
          type: 'Private',
          phone: '080-12345678',
          email: 'info@abc.edu',
          website: 'https://abc.edu',
          description: 'A premier medical college',
          approvedBy: 'INC',
          accreditation: 'NAAC A+',
        },
      });
      expect(result.success).toBe(true);
    });
  });

  describe('createEnquiry', () => {
    it('rejects missing studentId', () => {
      const result = createEnquiry.safeParse({
        body: { collegeId: 1 },
      });
      expect(result.success).toBe(false);
    });

    it('rejects invalid status', () => {
      const result = createEnquiry.safeParse({
        body: { studentId: 1, collegeId: 1, status: 'InvalidStatus' },
      });
      expect(result.success).toBe(false);
    });

    it('accepts valid enquiry', () => {
      const result = createEnquiry.safeParse({
        body: { studentId: 1, collegeId: 1, courseId: 5, status: 'New' },
      });
      expect(result.success).toBe(true);
    });
  });

  describe('publicEnquiry', () => {
    it('rejects non-Indian phone', () => {
      const result = publicEnquiry.safeParse({
        body: { name: 'Test', phone: '1234567890', collegeId: 1 },
      });
      expect(result.success).toBe(false);
    });

    it('accepts valid public enquiry', () => {
      const result = publicEnquiry.safeParse({
        body: { name: 'Priya', phone: '8876543210', collegeId: 1 },
      });
      expect(result.success).toBe(true);
    });

    it('accepts full public enquiry with all optional fields', () => {
      const result = publicEnquiry.safeParse({
        body: {
          name: 'Priya', phone: '8876543210', collegeId: 1,
          email: 'priya@gmail.com', city: 'Kochi', preferredCat: 'Nursing',
          budgetMax: 500000, percentage: 85, stream: 'Science', source: 'Website',
        },
      });
      expect(result.success).toBe(true);
    });
  });

  describe('createStudent', () => {
    it('rejects invalid percentage (>100)', () => {
      const result = createStudent.safeParse({
        body: { name: 'Test', phone: '9876543210', percentage: 105 },
      });
      expect(result.success).toBe(false);
    });

    it('accepts valid student', () => {
      const result = createStudent.safeParse({
        body: { name: 'Arun', phone: '9876543210', percentage: 85.5, stream: 'Science' },
      });
      expect(result.success).toBe(true);
    });
  });

  describe('createUser', () => {
    it('rejects invalid role', () => {
      const result = createUser.safeParse({
        body: { name: 'Test', email: 'a@b.com', password: '12345678', role: 'superadmin' },
      });
      expect(result.success).toBe(false);
    });

    it('accepts valid user', () => {
      const result = createUser.safeParse({
        body: { name: 'New Counselor', email: 'c@test.com', password: '12345678', role: 'consultant' },
      });
      expect(result.success).toBe(true);
    });
  });

  describe('careerLead', () => {
    it('rejects missing name', () => {
      const result = careerLead.safeParse({ body: { phone: '9876543210' } });
      expect(result.success).toBe(false);
    });

    it('accepts valid career lead', () => {
      const result = careerLead.safeParse({
        body: { name: 'Meera', phone: '9876543210', topCareer: 'Nursing', stage: '12th Completed' },
      });
      expect(result.success).toBe(true);
    });

    it('accepts career lead with allMatches array', () => {
      const result = careerLead.safeParse({
        body: { name: 'Meera', phone: '9876543210', allMatches: ['Nursing', 'Physiotherapy', 'Lab Tech'] },
      });
      expect(result.success).toBe(true);
    });
  });
});

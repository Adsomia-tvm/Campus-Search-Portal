/**
 * BOT AI MODULE — Claude-powered natural language understanding + response
 *
 * Uses Claude API with tool_use to:
 * 1. Understand what the user is asking (city, course, budget, etc.)
 * 2. Search the Campus Search database
 * 3. Generate a helpful, conversational WhatsApp reply
 *
 * Env: ANTHROPIC_API_KEY
 */

const Anthropic = require('@anthropic-ai/sdk').default;
const prisma = require('../prisma');

const client = new Anthropic(); // reads ANTHROPIC_API_KEY from env

// ── System prompt ──────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are Campus Search Bot — a friendly, knowledgeable college counselor for students in South India. You help students find colleges across Karnataka, Tamil Nadu, and Kerala.

Your database has 247+ colleges with real fee data, courses, accreditation, and contact info.

RULES:
- Keep replies SHORT — this is WhatsApp, not email. Max 5-6 lines unless showing search results.
- Use *bold* for emphasis (WhatsApp formatting).
- Always recommend specific colleges from search results — never make up college names.
- Show fees in Indian format: ₹1.2L, ₹50K, etc.
- When a user asks about colleges/courses/fees, ALWAYS use the search_colleges tool first.
- If the query is vague ("best college"), ask which city and course they're interested in.
- Be warm, use occasional emoji, speak like a helpful counselor.
- If you can't find what they're looking for, suggest they call +91 7407556677.
- For non-college queries, politely redirect: "I'm best at helping you find colleges! 🎓"
- When showing results, include a link: campussearch.in/college/{id}
- After showing results, offer: "Want details on any of these? Or share your name & number for a free callback!"
- NEVER invent data. Only share what comes from tool results.
- Respond in the same language the user writes in (English, Hindi, Malayalam, Tamil, Kannada). If mixed, use English.`;

// ── Tool definitions ───────────────────────────────────────────────────────
const TOOLS = [
  {
    name: 'search_colleges',
    description: 'Search colleges in the Campus Search database. Use this whenever the user asks about colleges, courses, fees, or anything education-related. Returns matching colleges with their courses and fees.',
    input_schema: {
      type: 'object',
      properties: {
        city: {
          type: 'string',
          description: 'City to search in (e.g., "Bangalore", "Mangalore", "Kochi"). Leave empty to search all cities.',
        },
        course: {
          type: 'string',
          description: 'Course or category to search for (e.g., "BBA", "Nursing", "MBA", "Engineering"). Leave empty for all courses.',
        },
        max_fee: {
          type: 'number',
          description: 'Maximum total fee budget in INR (e.g., 500000 for 5 lakhs). Leave empty for no budget filter.',
        },
        college_name: {
          type: 'string',
          description: 'Search by college name (partial match). Use when user asks about a specific college.',
        },
        type: {
          type: 'string',
          enum: ['Private', 'Deemed', 'Government', 'Autonomous'],
          description: 'Filter by college type. Only use if user specifically mentions it.',
        },
      },
      required: [],
    },
  },
  {
    name: 'get_college_details',
    description: 'Get detailed information about a specific college including all courses, fees, contact info. Use when user wants to know more about a particular college.',
    input_schema: {
      type: 'object',
      properties: {
        college_id: {
          type: 'number',
          description: 'The college ID from search results.',
        },
      },
      required: ['college_id'],
    },
  },
  {
    name: 'capture_lead',
    description: 'Save student contact info for counselor callback. Use when the user shares their name and phone number wanting to be contacted.',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Student name' },
        phone: { type: 'string', description: '10-digit phone number' },
        course_interest: { type: 'string', description: 'Course they are interested in' },
        city: { type: 'string', description: 'Preferred city' },
        college_id: { type: 'number', description: 'College ID if interested in a specific college' },
      },
      required: ['name', 'phone'],
    },
  },
];

// ── Tool execution ─────────────────────────────────────────────────────────
async function executeTool(name, input) {
  switch (name) {
    case 'search_colleges':
      return await toolSearchColleges(input);
    case 'get_college_details':
      return await toolGetCollegeDetails(input);
    case 'capture_lead':
      return await toolCaptureLead(input);
    default:
      return { error: 'Unknown tool' };
  }
}

async function toolSearchColleges({ city, course, max_fee, college_name, type }) {
  const where = { isActive: true };
  const courseWhere = { isActive: true };

  if (city) {
    where.city = { contains: city, mode: 'insensitive' };
  }
  if (type) {
    where.type = { contains: type, mode: 'insensitive' };
  }
  if (college_name) {
    where.name = { contains: college_name, mode: 'insensitive' };
  }
  if (max_fee) {
    where.minFee = { lte: max_fee };
  }
  if (course) {
    const courseTerm = course.split('/')[0].trim();
    courseWhere.OR = [
      { name: { contains: courseTerm, mode: 'insensitive' } },
      { category: { contains: courseTerm, mode: 'insensitive' } },
    ];
    where.courses = { some: courseWhere };
  }

  const colleges = await prisma.college.findMany({
    where,
    select: {
      id: true, name: true, city: true, state: true, type: true,
      accreditation: true, approvedBy: true, minFee: true, maxFee: true,
      verificationLevel: true, slug: true, citySlug: true,
      courses: {
        where: course ? courseWhere : { isActive: true },
        select: { id: true, name: true, category: true, totalFee: true, durationYrs: true, degreeLevel: true, hostelPerYr: true },
        orderBy: { totalFee: 'asc' },
        take: 5,
      },
    },
    orderBy: [{ verificationLevel: 'desc' }, { name: 'asc' }],
    take: 8,
  });

  if (!colleges.length) {
    return { found: 0, message: 'No colleges found matching your criteria.', colleges: [] };
  }

  return {
    found: colleges.length,
    colleges: colleges.map(c => ({
      id: c.id,
      name: c.name,
      city: c.city,
      state: c.state,
      type: c.type,
      accreditation: c.accreditation,
      approvedBy: c.approvedBy,
      feeRange: c.minFee ? `₹${fmtFee(c.minFee)} - ₹${fmtFee(c.maxFee)}` : null,
      verified: c.verificationLevel,
      url: c.slug && c.citySlug
        ? `campussearch.in/colleges/${c.citySlug}/${c.slug}`
        : `campussearch.in/college/${c.id}`,
      courses: c.courses.map(cr => ({
        name: cr.name,
        category: cr.category,
        fee: cr.totalFee ? `₹${fmtFee(cr.totalFee)}` : '—',
        feeRaw: cr.totalFee,
        duration: cr.durationYrs ? `${cr.durationYrs} years` : null,
        hostel: cr.hostelPerYr ? `₹${fmtFee(cr.hostelPerYr)}/yr` : null,
      })),
    })),
  };
}

async function toolGetCollegeDetails({ college_id }) {
  const college = await prisma.college.findUnique({
    where: { id: college_id },
    include: {
      courses: {
        where: { isActive: true },
        select: {
          name: true, category: true, totalFee: true, durationYrs: true,
          degreeLevel: true, y1Fee: true, hostelPerYr: true, quota: true,
        },
        orderBy: { totalFee: 'asc' },
      },
    },
  });

  if (!college) return { error: 'College not found' };

  return {
    id: college.id,
    name: college.name,
    city: college.city,
    state: college.state,
    type: college.type,
    accreditation: college.accreditation,
    approvedBy: college.approvedBy,
    phone: college.phone,
    email: college.email,
    website: college.website,
    description: college.description?.slice(0, 200),
    url: college.slug && college.citySlug
      ? `campussearch.in/colleges/${college.citySlug}/${college.slug}`
      : `campussearch.in/college/${college.id}`,
    totalCourses: college.courses.length,
    courses: college.courses.map(c => ({
      name: c.name,
      category: c.category,
      degree: c.degreeLevel,
      fee: c.totalFee ? `₹${fmtFee(c.totalFee)}` : '—',
      year1: c.y1Fee ? `₹${fmtFee(c.y1Fee)}` : null,
      duration: c.durationYrs ? `${c.durationYrs} years` : null,
      hostel: c.hostelPerYr ? `₹${fmtFee(c.hostelPerYr)}/yr` : null,
      quota: c.quota,
    })),
  };
}

async function toolCaptureLead({ name, phone, course_interest, city, college_id }) {
  try {
    let cleanPhone = phone.replace(/\D/g, '');
    if (cleanPhone.length === 12 && cleanPhone.startsWith('91')) cleanPhone = cleanPhone.slice(2);
    if (cleanPhone.length !== 10) return { error: 'Invalid phone number' };

    const student = await prisma.student.upsert({
      where: { phone: cleanPhone },
      update: { name, preferredCat: course_interest || null, preferredCity: city || null, source: 'WhatsApp' },
      create: { name, phone: cleanPhone, preferredCat: course_interest || null, preferredCity: city || null, source: 'WhatsApp' },
    });

    if (college_id) {
      const existing = await prisma.enquiry.findUnique({
        where: { studentId_collegeId: { studentId: student.id, collegeId: college_id } },
      });
      if (!existing) {
        const enquiry = await prisma.enquiry.create({
          data: { studentId: student.id, collegeId: college_id, source: 'WhatsApp', status: 'New' },
          include: { student: true, college: { select: { id: true, name: true, city: true } } },
        });
        const { notifyNewEnquiry } = require('../notify');
        notifyNewEnquiry(enquiry, { source: 'WhatsApp Bot AI' });
      }
    }

    return { success: true, message: `Saved ${name} (${cleanPhone}). A counselor will call soon.` };
  } catch (err) {
    console.error('[bot/ai] Lead capture error:', err.message);
    return { error: 'Could not save details. Please try again.' };
  }
}

// ── Main AI handler ────────────────────────────────────────────────────────
/**
 * Process a message using Claude AI.
 * @param {string} userMessage - The user's message
 * @param {Array} history - Conversation history [{role, text}]
 * @returns {string} Bot reply text
 */
async function aiReply(userMessage, history = []) {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn('[bot/ai] No ANTHROPIC_API_KEY set — AI disabled');
    return null; // Caller falls back to menu-based handling
  }

  try {
    // Build message history (last 6 exchanges max to save tokens)
    const messages = [];
    const recentHistory = history.slice(-12); // 6 exchanges = 12 messages

    for (const h of recentHistory) {
      messages.push({
        role: h.role === 'user' ? 'user' : 'assistant',
        content: h.text,
      });
    }

    // Add current message
    messages.push({ role: 'user', content: userMessage });

    // Call Claude with tools
    let response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 600,
      system: SYSTEM_PROMPT,
      tools: TOOLS,
      messages,
    });

    // Handle tool use loop (max 3 iterations)
    let iterations = 0;
    while (response.stop_reason === 'tool_use' && iterations < 3) {
      iterations++;
      const toolUseBlocks = response.content.filter(b => b.type === 'tool_use');

      // Execute all tool calls
      const toolResults = [];
      for (const block of toolUseBlocks) {
        const result = await executeTool(block.name, block.input);
        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: JSON.stringify(result),
        });
      }

      // Continue conversation with tool results
      messages.push({ role: 'assistant', content: response.content });
      messages.push({ role: 'user', content: toolResults });

      response = await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 600,
        system: SYSTEM_PROMPT,
        tools: TOOLS,
        messages,
      });
    }

    // Extract text response
    const textBlocks = response.content.filter(b => b.type === 'text');
    if (textBlocks.length) {
      return textBlocks.map(b => b.text).join('\n');
    }

    return null; // No text response — fall back to menu
  } catch (err) {
    console.error('[bot/ai] Claude API error:', err.message);
    return null; // Fall back to menu-based handling
  }
}

// ── Fee formatting helper ──────────────────────────────────────────────────
function fmtFee(amount) {
  if (!amount) return '—';
  if (amount >= 100000) return `${(amount / 100000).toFixed(1)}L`;
  if (amount >= 1000) return `${(amount / 1000).toFixed(0)}K`;
  return `${amount}`;
}

module.exports = { aiReply };

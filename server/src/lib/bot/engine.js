/**
 * BOT ENGINE — Core message router + all conversation flows
 *
 * States: MAIN_MENU, SEARCH_CITY, SEARCH_COURSE, SEARCH_RESULTS,
 *         STATUS_PHONE, LEAD_NAME, LEAD_PHONE, LEAD_COURSE,
 *         AGENT_AUTH, AGENT_MENU, AGENT_REFER_NAME, AGENT_REFER_PHONE, AGENT_REFER_COURSE,
 *         COLLEGE_DETAIL, FREE_TEXT
 */

const prisma = require('../prisma');
const { getSession, updateSession, resetSession, addToHistory } = require('./sessions');
const { notifyNewEnquiry } = require('../notify');
const { aiReply } = require('./ai');

// ── City list (top cities from DB, can be extended) ─────────────────────────
const TOP_CITIES = ['Bengaluru', 'Mangaluru', 'Mysuru', 'Kochi', 'Chennai', 'Coimbatore', 'Thiruvananthapuram', 'Kozhikode', 'Hubballi', 'Manipal'];

// Alias map: common spellings → DB city name
const CITY_ALIASES = {
  'bangalore': 'Bengaluru', 'banglore': 'Bengaluru', 'blr': 'Bengaluru',
  'mangalore': 'Mangaluru', 'mangalor': 'Mangaluru',
  'mysore': 'Mysuru', 'mysor': 'Mysuru',
  'trivandrum': 'Thiruvananthapuram', 'tvm': 'Thiruvananthapuram',
  'calicut': 'Kozhikode', 'kozikode': 'Kozhikode',
  'cochin': 'Kochi', 'ernakulam': 'Kochi',
  'madras': 'Chennai',
  'hubli': 'Hubballi', 'dharwad': 'Hubballi',
  'tumkur': 'Tumakuru', 'shimoga': 'Shivamogga',
};

// ── Course categories ───────────────────────────────────────────────────────
const COURSE_CATS = ['BBA / BCA / BCom', 'MBA / MCA / MCom', 'Engineering (BE/BTech)', 'Medical / Nursing', 'Allied Health Sciences', 'Arts & Science', 'Law', 'Pharmacy', 'Diploma'];

// ── Format helpers ──────────────────────────────────────────────────────────
function formatFee(amount) {
  if (!amount) return '—';
  if (amount >= 100000) return `₹${(amount / 100000).toFixed(1)}L`;
  if (amount >= 1000) return `₹${(amount / 1000).toFixed(0)}K`;
  return `₹${amount}`;
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN ROUTER — process incoming message and return reply text
// ══════════════════════════════════════════════════════════════════════════════
async function processMessage(phone, message) {
  const text = (message || '').trim();
  const lower = text.toLowerCase();
  addToHistory(phone, 'user', text);

  // Global commands (work from any state)
  if (['hi', 'hello', 'hey', 'start', 'menu', 'home', '0'].includes(lower)) {
    resetSession(phone);
    const reply = await mainMenu(phone);
    addToHistory(phone, 'bot', reply);
    return reply;
  }
  if (['stop', 'unsubscribe', 'quit'].includes(lower)) {
    resetSession(phone);
    return '✅ You\'ve been unsubscribed. Send HI anytime to start again.';
  }
  if (lower === 'help') {
    return '🆘 *Campus Search Help*\n\nSend:\n• *HI* — Main menu\n• *1* — Search colleges\n• *2* — Check application status\n• *3* — Talk to a counselor\n• *AGENT* — Agent portal\n• *STOP* — Unsubscribe\n\nOr just type your question and I\'ll try to help!';
  }

  const session = getSession(phone);

  // ── AI counselor: any non-menu input goes to AI when we have conversation history
  // Menu numbers (1-4) and short commands go through menu flow; everything else → AI
  const isMenuNumber = /^[1-4]$/.test(text.trim());
  const hasAIHistory = (session.history || []).some(h => h.role === 'bot' && h.text && !h.text.includes('Choose an option'));
  if (session.state === 'MAIN_MENU' && !isMenuNumber && (hasAIHistory || text.length > 5)) {
    const aiResponse = await aiReply(text, session.history || []);
    if (aiResponse) {
      addToHistory(phone, 'bot', aiResponse);
      return aiResponse;
    }
  }

  // Route based on current state
  let reply;
  try {
    switch (session.state) {
      case 'MAIN_MENU':
        reply = await handleMainMenu(phone, text, lower, session);
        break;
      case 'SEARCH_CITY':
        reply = await handleSearchCity(phone, text, lower, session);
        break;
      case 'SEARCH_COURSE':
        reply = await handleSearchCourse(phone, text, lower, session);
        break;
      case 'SEARCH_RESULTS':
        reply = await handleSearchResults(phone, text, lower, session);
        break;
      case 'COLLEGE_DETAIL':
        reply = await handleCollegeDetail(phone, text, lower, session);
        break;
      case 'STATUS_PHONE':
        reply = await handleStatusPhone(phone, text, lower, session);
        break;
      case 'LEAD_NAME':
        reply = await handleLeadName(phone, text, lower, session);
        break;
      case 'LEAD_PHONE':
        reply = await handleLeadPhone(phone, text, lower, session);
        break;
      case 'LEAD_COURSE':
        reply = await handleLeadCourse(phone, text, lower, session);
        break;
      case 'AGENT_AUTH':
        reply = await handleAgentAuth(phone, text, lower, session);
        break;
      case 'AGENT_MENU':
        reply = await handleAgentMenu(phone, text, lower, session);
        break;
      case 'AGENT_REFER_NAME':
        reply = await handleAgentReferName(phone, text, lower, session);
        break;
      case 'AGENT_REFER_PHONE':
        reply = await handleAgentReferPhone(phone, text, lower, session);
        break;
      case 'AGENT_REFER_COURSE':
        reply = await handleAgentReferCourse(phone, text, lower, session);
        break;
      default:
        reply = await mainMenu(phone);
    }
  } catch (err) {
    console.error('[bot] Error processing message:', err.message);
    reply = '⚠️ Something went wrong. Please try again or type *HI* to start over.';
  }

  addToHistory(phone, 'bot', reply);
  return reply;
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN MENU
// ══════════════════════════════════════════════════════════════════════════════
async function mainMenu(phone) {
  // Check if this phone is a known student
  const student = await prisma.student.findUnique({ where: { phone: normalizePhone(phone) }, select: { name: true } });
  const greeting = student ? `Hi ${student.name}! 👋` : 'Welcome to *Campus Search*! 🎓';

  return `${greeting}\n\nI can help you find the perfect college from *247+ institutions* across Karnataka, Tamil Nadu & Kerala.\n\nChoose an option:\n\n*1.* 🔍 Search Colleges\n*2.* 📋 Check Application Status\n*3.* 📞 Talk to a Counselor\n*4.* 🤝 Agent Portal\n\nOr just type your question!`;
}

async function handleMainMenu(phone, text, lower, session) {
  if (text === '1' || lower.includes('search') || lower.includes('college') || lower.includes('find')) {
    updateSession(phone, { state: 'SEARCH_CITY', step: 0, data: {} });
    return cityMenu();
  }
  if (text === '2' || lower.includes('status') || lower.includes('application') || lower.includes('check')) {
    updateSession(phone, { state: 'STATUS_PHONE', data: {} });
    return '📋 *Check Application Status*\n\nPlease share your registered phone number (10 digits):';
  }
  if (text === '3' || lower.includes('counselor') || lower.includes('counsel') || lower.includes('talk') || lower.includes('call')) {
    return '📞 *Talk to a Counselor*\n\nOur counselors are available Mon-Sat, 9 AM - 6 PM.\n\n📱 Call: +91 7407556677\n📧 Email: info@campussearch.in\n\nOr share your name and we\'ll call you back!\n\nType your *name* to get a callback, or *HI* to go back.';
  }
  if (text === '4' || lower.includes('agent') || lower.includes('refer')) {
    updateSession(phone, { state: 'AGENT_AUTH', data: {} });
    return '🤝 *Agent Portal*\n\nPlease enter your referral code (e.g., AGT-XK7M):';
  }

  // Free text — try to understand intent
  return await handleFreeText(phone, text, lower, session);
}

// ══════════════════════════════════════════════════════════════════════════════
// FLOW 1: COLLEGE SEARCH (city → course → results → detail)
// ══════════════════════════════════════════════════════════════════════════════
function cityMenu() {
  let menu = '🏙️ *Which city are you looking in?*\n\n';
  TOP_CITIES.forEach((c, i) => { menu += `*${i + 1}.* ${c}\n`; });
  menu += `\nOr type your city name.`;
  return menu;
}

async function handleSearchCity(phone, text, lower, session) {
  let city = null;

  // Check if it's a number selection
  const num = parseInt(text);
  if (num >= 1 && num <= TOP_CITIES.length) {
    city = TOP_CITIES[num - 1];
  } else {
    // Check alias first (bangalore → Bengaluru)
    const alias = CITY_ALIASES[lower];
    if (alias) {
      city = alias;
    } else {
      // Try to match city name from DB
      const match = await prisma.college.findFirst({
        where: { city: { contains: text, mode: 'insensitive' }, isActive: true },
        select: { city: true },
      });
      if (match) city = match.city;
      else {
        const fuzzy = TOP_CITIES.find(c => c.toLowerCase().includes(lower));
        if (fuzzy) city = fuzzy;
      }
    }
  }

  if (!city) {
    return `Sorry, I couldn't find "${text}" in our database.\n\n${cityMenu()}`;
  }

  updateSession(phone, { state: 'SEARCH_COURSE', data: { city } });
  return courseMenu(city);
}

function courseMenu(city) {
  let menu = `📚 *What course are you interested in?*\n📍 City: ${city}\n\n`;
  COURSE_CATS.forEach((c, i) => { menu += `*${i + 1}.* ${c}\n`; });
  menu += `\nOr type the course name.`;
  return menu;
}

async function handleSearchCourse(phone, text, lower, session) {
  let courseQuery = null;

  const num = parseInt(text);
  if (num >= 1 && num <= COURSE_CATS.length) {
    courseQuery = COURSE_CATS[num - 1];
  } else {
    courseQuery = text;
  }

  const city = session.data.city;

  // Search colleges with matching courses in the selected city
  const colleges = await prisma.college.findMany({
    where: {
      city: { contains: city, mode: 'insensitive' },
      isActive: true,
      courses: {
        some: {
          isActive: true,
          OR: [
            { name: { contains: courseQuery.split('/')[0].trim(), mode: 'insensitive' } },
            { category: { contains: courseQuery.split('/')[0].trim(), mode: 'insensitive' } },
          ],
        },
      },
    },
    select: {
      id: true, name: true, city: true, type: true, minFee: true, maxFee: true,
      accreditation: true, verificationLevel: true,
      courses: {
        where: {
          isActive: true,
          OR: [
            { name: { contains: courseQuery.split('/')[0].trim(), mode: 'insensitive' } },
            { category: { contains: courseQuery.split('/')[0].trim(), mode: 'insensitive' } },
          ],
        },
        select: { id: true, name: true, totalFee: true, durationYrs: true },
        take: 3,
      },
    },
    orderBy: [{ verificationLevel: 'desc' }, { name: 'asc' }],
    take: 10,
  });

  if (!colleges.length) {
    updateSession(phone, { state: 'SEARCH_CITY', data: {} });
    return `😕 No colleges found for "${courseQuery}" in ${city}.\n\nTry a different course or city.\n\n${cityMenu()}`;
  }

  // Store results for pagination/detail
  updateSession(phone, {
    state: 'SEARCH_RESULTS',
    data: { ...session.data, courseQuery, results: colleges },
  });

  let reply = `🎓 Found *${colleges.length} college${colleges.length > 1 ? 's' : ''}* for ${courseQuery} in ${city}:\n\n`;

  colleges.forEach((col, i) => {
    const fee = col.courses[0]?.totalFee ? formatFee(col.courses[0].totalFee) : (col.minFee ? `${formatFee(col.minFee)}-${formatFee(col.maxFee)}` : '—');
    const badge = col.verificationLevel === 'Premium' ? '⭐ ' : col.verificationLevel === 'Verified' ? '✅ ' : '';
    reply += `*${i + 1}.* ${badge}${col.name}\n`;
    reply += `    📚 ${col.courses[0]?.name || courseQuery} — ${fee}${col.courses[0]?.durationYrs ? ` (${col.courses[0].durationYrs}yr)` : ''}\n`;
    if (col.accreditation) reply += `    🏅 ${col.accreditation}\n`;
    reply += '\n';
  });

  reply += `Reply with a *number* (1-${colleges.length}) for details.\nOr type your *name* to get personalized help.`;
  return reply;
}

async function handleSearchResults(phone, text, lower, session) {
  const results = session.data.results || [];
  const num = parseInt(text);

  if (num >= 1 && num <= results.length) {
    const college = results[num - 1];
    updateSession(phone, { state: 'COLLEGE_DETAIL', data: { ...session.data, selectedCollege: college } });
    return await collegeDetailReply(college);
  }

  // If they typed a name → lead capture
  if (text.length > 2 && isNaN(text) && !['hi', 'menu', 'back'].includes(lower)) {
    updateSession(phone, { state: 'LEAD_PHONE', data: { ...session.data, leadName: text } });
    return `Hi *${text}*! 👋\n\nTo send you detailed info about these colleges, can you share your phone number?\n\n(Type *SKIP* to continue browsing)`;
  }

  if (lower === 'back') {
    updateSession(phone, { state: 'SEARCH_CITY', data: {} });
    return cityMenu();
  }

  return `Please reply with a number (1-${results.length}) to see college details, or type your *name* for personalized help.`;
}

async function collegeDetailReply(college) {
  // Fetch full details
  const full = await prisma.college.findUnique({
    where: { id: college.id },
    include: {
      courses: { where: { isActive: true }, select: { name: true, totalFee: true, durationYrs: true, category: true }, orderBy: { totalFee: 'asc' }, take: 8 },
    },
  });

  if (!full) return '⚠️ College details not found. Type *HI* to start over.';

  let reply = `🏫 *${full.name}*\n`;
  if (full.city) reply += `📍 ${full.city}${full.state ? `, ${full.state}` : ''}\n`;
  if (full.type) reply += `🏛️ ${full.type}\n`;
  if (full.accreditation) reply += `🏅 ${full.accreditation}\n`;
  if (full.approvedBy) reply += `✅ Approved: ${full.approvedBy}\n`;
  reply += '\n';

  if (full.courses.length) {
    reply += `📚 *Courses Available:*\n`;
    full.courses.forEach(c => {
      reply += `• ${c.name} — ${formatFee(c.totalFee)}${c.durationYrs ? ` (${c.durationYrs}yr)` : ''}\n`;
    });
    reply += '\n';
  }

  if (full.phone) reply += `📞 ${full.phone}\n`;
  if (full.website) reply += `🌐 ${full.website}\n`;
  reply += `\n🔗 View full details: ${process.env.CLIENT_URL || 'https://campussearch.in'}/college/${full.slug || full.id}\n`;
  reply += '\n*What would you like to do?*\n';
  reply += '*1.* 📝 Apply / Get callback\n';
  reply += '*2.* 🔙 Back to results\n';
  reply += '*3.* 🏠 Main menu';

  return reply;
}

async function handleCollegeDetail(phone, text, lower, session) {
  if (text === '1' || lower.includes('apply') || lower.includes('callback')) {
    updateSession(phone, { state: 'LEAD_NAME', data: { ...session.data } });
    return '📝 *Great! Let\'s get you connected.*\n\nWhat is your name?';
  }
  if (text === '2' || lower === 'back') {
    updateSession(phone, { state: 'SEARCH_RESULTS', data: session.data });
    // Rebuild results reply
    return await handleSearchCourse(phone, session.data.courseQuery || '', '', { ...session, state: 'SEARCH_COURSE' });
  }
  if (text === '3') {
    resetSession(phone);
    return await mainMenu(phone);
  }
  return 'Please choose:\n*1.* Apply / Get callback\n*2.* Back to results\n*3.* Main menu';
}

// ══════════════════════════════════════════════════════════════════════════════
// FLOW 2: LEAD CAPTURE (name → phone → course interest → create CRM lead)
// ══════════════════════════════════════════════════════════════════════════════
async function handleLeadName(phone, text, lower, session) {
  if (text.length < 2) return 'Please enter your full name:';

  updateSession(phone, { state: 'LEAD_PHONE', data: { ...session.data, leadName: text } });
  return `Thanks *${text}*! 👋\n\nWhat is your phone number? (10 digits)\n\n(Type *SKIP* to use your WhatsApp number)`;
}

async function handleLeadPhone(phone, text, lower, session) {
  let leadPhone;

  if (lower === 'skip') {
    leadPhone = normalizePhone(phone);
  } else {
    leadPhone = text.replace(/\D/g, '');
    if (leadPhone.length === 12 && leadPhone.startsWith('91')) leadPhone = leadPhone.slice(2);
    if (leadPhone.length !== 10) {
      return 'Please enter a valid 10-digit phone number, or type *SKIP* to use your WhatsApp number.';
    }
  }

  updateSession(phone, { state: 'LEAD_COURSE', data: { ...session.data, leadPhone } });

  let menu = '📚 *What course are you interested in?*\n\n';
  COURSE_CATS.forEach((c, i) => { menu += `*${i + 1}.* ${c}\n`; });
  menu += '\nOr type the course name.';
  return menu;
}

async function handleLeadCourse(phone, text, lower, session) {
  let courseInterest;
  const num = parseInt(text);
  if (num >= 1 && num <= COURSE_CATS.length) {
    courseInterest = COURSE_CATS[num - 1];
  } else {
    courseInterest = text;
  }

  const { leadName, leadPhone, city, selectedCollege } = session.data;

  // Create or update student + enquiry in CRM
  try {
    const student = await prisma.student.upsert({
      where: { phone: leadPhone },
      update: { name: leadName, preferredCat: courseInterest, preferredCity: city || null, source: 'WhatsApp' },
      create: { name: leadName, phone: leadPhone, preferredCat: courseInterest, preferredCity: city || null, source: 'WhatsApp' },
    });

    // Create enquiry if a college is selected
    if (selectedCollege?.id) {
      const existingEnq = await prisma.enquiry.findUnique({
        where: { studentId_collegeId: { studentId: student.id, collegeId: selectedCollege.id } },
      });
      if (!existingEnq) {
        const enquiry = await prisma.enquiry.create({
          data: {
            studentId: student.id,
            collegeId: selectedCollege.id,
            source: 'WhatsApp',
            status: 'New',
          },
          include: { student: true, college: { select: { id: true, name: true, city: true } } },
        });
        // Fire notification
        notifyNewEnquiry(enquiry, { source: 'WhatsApp Bot', leadScore: 0 });
      }
    }

    resetSession(phone);
    let reply = `✅ *Thank you, ${leadName}!*\n\nYour details have been saved. A counselor will contact you shortly.\n\n`;
    if (selectedCollege) {
      reply += `🏫 College: ${selectedCollege.name}\n`;
    }
    reply += `📚 Interest: ${courseInterest}\n`;
    if (city) reply += `📍 City: ${city}\n`;
    reply += `\nMeanwhile, feel free to ask me anything about colleges, courses, or fees!\n\nType *HI* for main menu.`;
    return reply;
  } catch (err) {
    console.error('[bot] Lead creation error:', err.message);
    resetSession(phone);
    return '⚠️ There was an issue saving your details. Please try again or call us at +91 7407556677.';
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// FLOW 3: STATUS CHECK (phone → lookup → show status)
// ══════════════════════════════════════════════════════════════════════════════
async function handleStatusPhone(phone, text, lower, session) {
  let checkPhone = text.replace(/\D/g, '');
  if (checkPhone.length === 12 && checkPhone.startsWith('91')) checkPhone = checkPhone.slice(2);
  if (lower === 'skip' || lower === 'me') checkPhone = normalizePhone(phone);

  if (checkPhone.length !== 10) {
    return 'Please enter a valid 10-digit phone number.\n\nOr type *ME* to check with your WhatsApp number.';
  }

  const student = await prisma.student.findUnique({
    where: { phone: checkPhone },
    include: {
      enquiries: {
        include: {
          college: { select: { name: true, city: true } },
          course: { select: { name: true } },
          counselor: { select: { name: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 5,
      },
    },
  });

  resetSession(phone);

  if (!student || !student.enquiries.length) {
    return `🔍 No applications found for phone number ${checkPhone}.\n\nIf you haven't applied yet, type *1* to search colleges and apply!\n\nType *HI* for main menu.`;
  }

  const STATUS_EMOJI = { New: '📋', Contacted: '📞', Visited: '🏫', Applied: '📝', Enrolled: '✅', Dropped: '❌' };

  let reply = `📋 *Applications for ${student.name}*\n\n`;
  student.enquiries.forEach((enq, i) => {
    const emoji = STATUS_EMOJI[enq.status] || '🔄';
    reply += `${i + 1}. ${emoji} *${enq.college?.name || 'Unknown'}*${enq.college?.city ? `, ${enq.college.city}` : ''}\n`;
    if (enq.course) reply += `   📚 ${enq.course.name}\n`;
    reply += `   📊 Status: *${enq.status}*\n`;
    if (enq.counselor) reply += `   👤 Counselor: ${enq.counselor.name}\n`;
    reply += `   📅 ${enq.createdAt.toLocaleDateString('en-IN', { dateStyle: 'medium' })}\n\n`;
  });

  reply += 'Type *HI* for main menu.';
  return reply;
}

// ══════════════════════════════════════════════════════════════════════════════
// FLOW 4: AGENT PORTAL (auth → menu → refer/leads/commissions)
// ══════════════════════════════════════════════════════════════════════════════
async function handleAgentAuth(phone, text, lower, session) {
  const code = text.toUpperCase().trim();
  const agent = await prisma.agent.findUnique({
    where: { referralCode: code },
    include: { user: { select: { name: true, email: true } } },
  });

  if (!agent) {
    return `❌ Referral code "${code}" not found.\n\nPlease check your code and try again, or type *HI* to go back.`;
  }

  updateSession(phone, { state: 'AGENT_MENU', data: { agentId: agent.id, agentName: agent.user.name, referralCode: code } });
  return `Welcome back, *${agent.user.name}*! 🤝\n\n*Agent Portal*\n\n*1.* 📝 Refer a Student\n*2.* 📊 My Leads\n*3.* 💰 My Commissions\n*4.* 🏠 Main Menu`;
}

async function handleAgentMenu(phone, text, lower, session) {
  if (text === '1' || lower.includes('refer')) {
    updateSession(phone, { state: 'AGENT_REFER_NAME', data: session.data });
    return '📝 *Refer a Student*\n\nWhat is the student\'s name?';
  }
  if (text === '2' || lower.includes('lead')) {
    return await agentLeadsSummary(session.data.agentId, session.data.agentName);
  }
  if (text === '3' || lower.includes('commission') || lower.includes('earning')) {
    return await agentCommissionSummary(session.data.agentId, session.data.agentName);
  }
  if (text === '4') {
    resetSession(phone);
    return await mainMenu(phone);
  }
  return 'Choose:\n*1.* Refer a Student\n*2.* My Leads\n*3.* My Commissions\n*4.* Main Menu';
}

async function handleAgentReferName(phone, text, lower, session) {
  if (text.length < 2) return 'Please enter the student\'s full name:';
  updateSession(phone, { state: 'AGENT_REFER_PHONE', data: { ...session.data, referName: text } });
  return `Student: *${text}*\n\nWhat is the student's phone number? (10 digits)`;
}

async function handleAgentReferPhone(phone, text, lower, session) {
  let studentPhone = text.replace(/\D/g, '');
  if (studentPhone.length === 12 && studentPhone.startsWith('91')) studentPhone = studentPhone.slice(2);
  if (studentPhone.length !== 10) return 'Please enter a valid 10-digit phone number.';

  updateSession(phone, { state: 'AGENT_REFER_COURSE', data: { ...session.data, referPhone: studentPhone } });

  let menu = '📚 *Course interest?*\n\n';
  COURSE_CATS.forEach((c, i) => { menu += `*${i + 1}.* ${c}\n`; });
  menu += '\nOr type the course/college name.';
  return menu;
}

async function handleAgentReferCourse(phone, text, lower, session) {
  let courseInterest;
  const num = parseInt(text);
  if (num >= 1 && num <= COURSE_CATS.length) {
    courseInterest = COURSE_CATS[num - 1];
  } else {
    courseInterest = text;
  }

  const { agentId, agentName, referralCode, referName, referPhone } = session.data;

  try {
    // Create student
    const student = await prisma.student.upsert({
      where: { phone: referPhone },
      update: { name: referName, preferredCat: courseInterest, source: 'Agent' },
      create: { name: referName, phone: referPhone, preferredCat: courseInterest, source: 'Agent' },
    });

    // Reset to agent menu
    updateSession(phone, { state: 'AGENT_MENU', data: { agentId, agentName, referralCode } });

    return `✅ *Referral Submitted!*\n\n👤 Student: ${referName}\n📞 Phone: ${referPhone}\n📚 Interest: ${courseInterest}\n🤝 Agent: ${agentName} (${referralCode})\n\nOur team will assign a college and follow up. You'll be notified when the status changes.\n\nChoose:\n*1.* Refer another student\n*2.* My Leads\n*3.* My Commissions\n*4.* Main Menu`;
  } catch (err) {
    console.error('[bot] Agent referral error:', err.message);
    updateSession(phone, { state: 'AGENT_MENU', data: { agentId, agentName, referralCode } });
    return '⚠️ Error submitting referral. Please try again.\n\n*1.* Refer a Student\n*2.* My Leads\n*3.* My Commissions\n*4.* Main Menu';
  }
}

async function agentLeadsSummary(agentId, agentName) {
  const enquiries = await prisma.enquiry.findMany({
    where: { agentId },
    include: {
      student: { select: { name: true, phone: true } },
      college: { select: { name: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 10,
  });

  const STATUS_EMOJI = { New: '📋', Contacted: '📞', Visited: '🏫', Applied: '📝', Enrolled: '✅', Dropped: '❌' };

  if (!enquiries.length) {
    return `📊 *${agentName}'s Leads*\n\nNo leads yet. Start referring students!\n\n*1.* Refer a Student\n*2.* My Commissions\n*3.* Main Menu`;
  }

  let reply = `📊 *${agentName}'s Leads* (Last ${enquiries.length})\n\n`;
  enquiries.forEach((enq, i) => {
    const emoji = STATUS_EMOJI[enq.status] || '🔄';
    reply += `${i + 1}. ${emoji} ${enq.student?.name || '—'} → ${enq.college?.name || '—'}\n`;
    reply += `   Status: *${enq.status}*\n\n`;
  });

  reply += '*1.* Refer a Student\n*3.* My Commissions\n*4.* Main Menu';
  return reply;
}

async function agentCommissionSummary(agentId, agentName) {
  const commissions = await prisma.commission.findMany({
    where: { agentId },
    select: { agentAmount: true, status: true },
  });

  const totals = { total: 0, received: 0, pending: 0, count: commissions.length };
  commissions.forEach(c => {
    const amt = c.agentAmount || 0;
    totals.total += amt;
    if (c.status === 'Received') totals.received += amt;
    if (c.status === 'Pending' || c.status === 'Invoiced') totals.pending += amt;
  });

  return `💰 *${agentName}'s Commissions*\n\n📦 Total Referrals: ${totals.count}\n💵 Total Earned: ${formatFee(totals.total)}\n✅ Received: ${formatFee(totals.received)}\n⏳ Pending: ${formatFee(totals.pending)}\n\nVisit your Agent Portal for full details.\n\n*1.* Refer a Student\n*2.* My Leads\n*4.* Main Menu`;
}

// ══════════════════════════════════════════════════════════════════════════════
// FREE TEXT HANDLER — AI-powered (falls back to keyword search if no API key)
// ══════════════════════════════════════════════════════════════════════════════
async function handleFreeText(phone, text, lower, session) {
  // Try AI first (if ANTHROPIC_API_KEY is set)
  const history = session.history || [];
  const aiResponse = await aiReply(text, history);
  if (aiResponse) return aiResponse;

  // ── Fallback: basic keyword matching (no AI key configured) ──────────
  if (lower.match(/fee|cost|price|how much|best|top|ranking|placement/)) {
    const result = await searchFromText(text);
    if (result) return result;
  }

  if (lower.match(/eligib|cutoff|percent|marks|score/)) {
    return '📊 Eligibility varies by college and course. To check eligibility for a specific college:\n\n*1.* Search Colleges (I\'ll show you details)\n*3.* Talk to a Counselor\n\nOr tell me the college name and course you\'re interested in.';
  }

  const result = await searchFromText(text);
  if (result) return result;

  return `I'm not sure I understood that. Here's what I can help with:\n\n*1.* 🔍 Search Colleges\n*2.* 📋 Check Application Status\n*3.* 📞 Talk to a Counselor\n*4.* 🤝 Agent Portal\n\nOr ask about a specific college or course!`;
}

async function searchFromText(text) {
  // Try to find colleges matching the text
  const colleges = await prisma.college.findMany({
    where: {
      isActive: true,
      OR: [
        { name: { contains: text.split(' ').slice(0, 3).join(' '), mode: 'insensitive' } },
        { courses: { some: { name: { contains: text, mode: 'insensitive' }, isActive: true } } },
      ],
    },
    select: {
      id: true, name: true, city: true, minFee: true, maxFee: true, slug: true,
      courses: { where: { isActive: true }, select: { name: true, totalFee: true }, take: 3 },
    },
    take: 5,
  });

  if (!colleges.length) return null;

  let reply = `🔍 Here's what I found:\n\n`;
  colleges.forEach((col, i) => {
    reply += `*${i + 1}. ${col.name}*${col.city ? ` — ${col.city}` : ''}\n`;
    if (col.courses.length) {
      col.courses.forEach(c => {
        reply += `   • ${c.name} — ${formatFee(c.totalFee)}\n`;
      });
    } else if (col.minFee) {
      reply += `   💰 Fees: ${formatFee(col.minFee)} - ${formatFee(col.maxFee)}\n`;
    }
    reply += '\n';
  });

  reply += 'Type *1* to search colleges by city & course for more results.\nOr share your *name* to get personalized help!';
  return reply;
}

// ══════════════════════════════════════════════════════════════════════════════
// UTILITIES
// ══════════════════════════════════════════════════════════════════════════════
function normalizePhone(phone) {
  let p = (phone || '').replace(/\D/g, '');
  if (p.length === 12 && p.startsWith('91')) p = p.slice(2);
  if (p.length === 13 && p.startsWith('091')) p = p.slice(3);
  return p;
}

module.exports = { processMessage };

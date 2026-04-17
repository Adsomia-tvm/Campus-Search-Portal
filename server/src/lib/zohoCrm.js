/**
 * INT-02: Zoho CRM Integration
 *
 * Syncs Campus Search leads/enquiries with Zoho CRM.
 * Maps: Enquiry → Zoho Lead, College → Zoho Account, Student → Zoho Contact
 *
 * Setup: Set ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET, ZOHO_REFRESH_TOKEN,
 *        ZOHO_CRM_DOMAIN (default: www.zohoapis.in for India DC)
 *
 * OAuth flow: Use refresh token to get access token (auto-renewed).
 */

const DOMAIN = process.env.ZOHO_CRM_DOMAIN || 'www.zohoapis.in';
const TOKEN_URL = process.env.ZOHO_AUTH_DOMAIN || 'https://accounts.zoho.in';

let _accessToken = null;
let _tokenExpiry = 0;

// ── OAuth Token Management ─────────────────────────────────────────────────

async function getAccessToken() {
  const now = Date.now();
  if (_accessToken && now < _tokenExpiry) return _accessToken;

  const { ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET, ZOHO_REFRESH_TOKEN } = process.env;
  if (!ZOHO_CLIENT_ID || !ZOHO_CLIENT_SECRET || !ZOHO_REFRESH_TOKEN) {
    throw new Error('Zoho CRM credentials not configured');
  }

  const params = new URLSearchParams({
    refresh_token: ZOHO_REFRESH_TOKEN,
    client_id: ZOHO_CLIENT_ID,
    client_secret: ZOHO_CLIENT_SECRET,
    grant_type: 'refresh_token',
  });

  const res = await fetch(`${TOKEN_URL}/oauth/v2/token?${params}`, { method: 'POST' });
  const data = await res.json();

  if (!data.access_token) {
    throw new Error(`Zoho auth failed: ${data.error || 'unknown'}`);
  }

  _accessToken = data.access_token;
  _tokenExpiry = now + ((data.expires_in || 3600) - 60) * 1000; // Refresh 60s early
  return _accessToken;
}

// ── API Helper ─────────────────────────────────────────────────────────────

async function zohoRequest(method, path, body = null) {
  const token = await getAccessToken();
  const opts = {
    method,
    headers: {
      'Authorization': `Zoho-oauthtoken ${token}`,
      'Content-Type': 'application/json',
    },
  };
  if (body) opts.body = JSON.stringify(body);

  const res = await fetch(`https://${DOMAIN}/crm/v5${path}`, opts);

  if (res.status === 204) return null;
  const data = await res.json();

  if (!res.ok) {
    const msg = data?.message || data?.code || `Zoho API error ${res.status}`;
    const err = new Error(msg);
    err.status = res.status;
    err.zohoError = data;
    throw err;
  }
  return data;
}

// ── Map Campus Search data → Zoho CRM fields ──────────────────────────────

function mapEnquiryToLead(enquiry) {
  const studentName = enquiry.student?.name || 'Unknown';
  const nameParts = studentName.trim().split(/\s+/);
  const firstName = nameParts[0] || '';
  const lastName = nameParts.slice(1).join(' ') || firstName; // Zoho requires Last_Name

  return {
    First_Name: firstName,
    Last_Name: lastName,
    Phone: enquiry.student?.phone || '',
    Email: enquiry.student?.email || '',
    Company: enquiry.college?.name || 'Direct Enquiry',
    Lead_Source: mapSource(enquiry.source),
    Lead_Status: mapStatus(enquiry.status),
    Description: [
      `College: ${enquiry.college?.name || 'N/A'}`,
      `Course: ${enquiry.course?.name || 'N/A'}`,
      `CS Lead Score: ${enquiry.leadScore || 0}`,
      `Qualification: ${enquiry.qualificationStatus || 'N/A'}`,
      enquiry.notes ? `Notes: ${enquiry.notes}` : '',
    ].filter(Boolean).join('\n'),
    // Custom fields (create in Zoho first)
    CS_Enquiry_ID: String(enquiry.id),
    CS_Lead_Score: enquiry.leadScore || 0,
    CS_College: enquiry.college?.name || '',
    CS_Course: enquiry.course?.name || '',
  };
}

function mapSource(source) {
  const sourceMap = {
    'Website': 'Web Form',
    'Agent': 'External Referral',
    'WhatsApp': 'Chat',
    'Walk-in': 'Walk-in',
    'Fee Gate': 'Web Form',
    'Career Clarity': 'Web Form',
  };
  return sourceMap[source] || 'Other';
}

function mapStatus(status) {
  const statusMap = {
    'New': 'Not Contacted',
    'Contacted': 'Contacted',
    'Visited': 'Contact in Future',
    'Applied': 'Attempt to Contact',
    'Enrolled': 'Closed - Converted',
    'Dropped': 'Lost Lead',
  };
  return statusMap[status] || 'Not Contacted';
}

function mapCollegeToAccount(college) {
  return {
    Account_Name: college.name,
    Phone: college.phone || '',
    Website: college.website || '',
    Billing_City: college.city || '',
    Billing_State: college.state || '',
    Billing_Country: 'India',
    Account_Type: 'Customer',
    Industry: 'Education',
    Description: [
      college.type ? `Type: ${college.type}` : '',
      college.accreditation ? `Accreditation: ${college.accreditation}` : '',
      college.approvedBy ? `Approved by: ${college.approvedBy}` : '',
    ].filter(Boolean).join('\n'),
  };
}

function mapStudentToContact(student) {
  const nameParts = (student.name || 'Unknown').trim().split(/\s+/);
  return {
    First_Name: nameParts[0] || '',
    Last_Name: nameParts.slice(1).join(' ') || nameParts[0],
    Phone: student.phone || '',
    Email: student.email || '',
    Mailing_State: student.state || '',
    Mailing_Country: 'India',
  };
}

// ── CRUD Operations ────────────────────────────────────────────────────────

async function pushLead(enquiry) {
  const data = mapEnquiryToLead(enquiry);
  return zohoRequest('POST', '/Leads', { data: [data] });
}

async function updateLead(zohoId, enquiry) {
  const data = mapEnquiryToLead(enquiry);
  return zohoRequest('PUT', `/Leads/${zohoId}`, { data: [data] });
}

async function pushAccount(college) {
  const data = mapCollegeToAccount(college);
  return zohoRequest('POST', '/Accounts', { data: [data] });
}

async function pushContact(student) {
  const data = mapStudentToContact(student);
  return zohoRequest('POST', '/Contacts', { data: [data] });
}

// ── Search (to avoid duplicates) ───────────────────────────────────────────

async function findLeadByPhone(phone) {
  const criteria = `(Phone:equals:${phone})`;
  const result = await zohoRequest('GET', `/Leads/search?criteria=${encodeURIComponent(criteria)}`);
  return result?.data?.[0] || null;
}

async function findLeadByEnquiryId(enquiryId) {
  const criteria = `(CS_Enquiry_ID:equals:${enquiryId})`;
  try {
    const result = await zohoRequest('GET', `/Leads/search?criteria=${encodeURIComponent(criteria)}`);
    return result?.data?.[0] || null;
  } catch {
    return null; // Custom field may not exist yet
  }
}

// ── Upsert (push or update) ────────────────────────────────────────────────

async function syncEnquiry(enquiry) {
  // Try to find existing lead by enquiry ID first, then by phone
  let existing = await findLeadByEnquiryId(enquiry.id);
  if (!existing && enquiry.student?.phone) {
    existing = await findLeadByPhone(enquiry.student.phone);
  }

  if (existing) {
    return updateLead(existing.id, enquiry);
  }
  return pushLead(enquiry);
}

// ── Bulk Sync ──────────────────────────────────────────────────────────────

async function bulkSyncLeads(enquiries) {
  const leads = enquiries.map(mapEnquiryToLead);
  // Zoho allows max 100 records per API call
  const results = [];
  for (let i = 0; i < leads.length; i += 100) {
    const batch = leads.slice(i, i + 100);
    const result = await zohoRequest('POST', '/Leads/upsert', {
      data: batch,
      duplicate_check_fields: ['Phone'],
    });
    results.push(result);
  }
  return results;
}

// ── Check if configured ────────────────────────────────────────────────────

function isConfigured() {
  return !!(process.env.ZOHO_CLIENT_ID && process.env.ZOHO_CLIENT_SECRET && process.env.ZOHO_REFRESH_TOKEN);
}

module.exports = {
  syncEnquiry,
  pushLead,
  updateLead,
  pushAccount,
  pushContact,
  findLeadByPhone,
  findLeadByEnquiryId,
  bulkSyncLeads,
  isConfigured,
};

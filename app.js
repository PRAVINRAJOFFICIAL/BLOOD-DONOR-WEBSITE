const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
const COMPATIBILITY = {
  'O-': ['O-', 'O+', 'A-', 'A+', 'B-', 'B+', 'AB-', 'AB+'],
  'O+': ['O+', 'A+', 'B+', 'AB+'],
  'A-': ['A-', 'A+', 'AB-', 'AB+'],
  'A+': ['A+', 'AB+'],
  'B-': ['B-', 'B+', 'AB-', 'AB+'],
  'B+': ['B+', 'AB+'],
  'AB-': ['AB-', 'AB+'],
  'AB+': ['AB+']
};

const state = {
  session: null,
  profile: null,
  donors: [],
  requests: [],
  profiles: [],
  userLocation: null,
  sortByNearest: false,
  editingDonorId: null,
  editingRequestId: null
};

function logAction(message, payload) {
  console.log(`[App] ${message}`, payload || '');
}

function showToast(text, type = 'success') {
  const container = document.getElementById('toastContainer');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = text;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

function setMessage(text, type = 'success') {
  const msg = document.getElementById('appMessage');
  if (!msg) return;
  msg.textContent = text;
  msg.className = `app-message ${type}`;
}

function getSupabaseClient() {
  if (window.supabaseClient && typeof window.supabaseClient.from === 'function') {
    return window.supabaseClient;
  }
  if (window.supabase && typeof window.supabase.createClient === 'function' && window.SUPABASE_CONFIG) {
    window.supabaseClient = window.supabase.createClient(
      window.SUPABASE_CONFIG.url,
      window.SUPABASE_CONFIG.anonKey,
      {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true
        }
      }
    );
  }
  return window.supabaseClient && typeof window.supabaseClient.from === 'function'
    ? window.supabaseClient
    : null;
}

function showSection(sectionId) {
  document.querySelectorAll('main section').forEach((section) => {
    section.classList.add('hidden');
  });

  const target = document.getElementById(sectionId);

  if (target) {
    target.classList.remove('hidden');
  }
}

function updateUserMenu() {
  const loginBtn = document.getElementById('loginBtn');
  const userMenu = document.getElementById('userMenu');
  const profileAvatar = document.getElementById('profileAvatar');
  const profileUserName = document.getElementById('profileUserName');
  const profileUserEmail = document.getElementById('profileUserEmail');

  if (!loginBtn || !userMenu || !profileAvatar || !profileUserName || !profileUserEmail) return;

  if (state.session && state.profile) {
    loginBtn.classList.add('hidden');
    userMenu.classList.remove('hidden');
    profileAvatar.textContent = (state.profile.donor_name || state.profile.email || 'U').charAt(0).toUpperCase();
    profileUserName.textContent = state.profile.donor_name || state.profile.email || 'User';
    profileUserEmail.textContent = state.profile.email || '';
  } else {
    loginBtn.classList.remove('hidden');
    userMenu.classList.add('hidden');
  }
}

function maskPhone(phone) {
  if (!phone) return 'Hidden';
  return phone.replace(/.(?=.{4})/g, '*');
}

function formatDate(dateString) {
  if (!dateString) return '—';
  return new Date(dateString).toLocaleString();
}

function getBadge(donationCount) {
  if (donationCount >= 10) return 'Life Saver';
  if (donationCount >= 6) return 'Gold Donor';
  if (donationCount >= 3) return 'Silver Donor';
  return 'Bronze Donor';
}

function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function requireAuth() {
  if (!state.session) {
    showToast('Please login to use this feature.', 'error');
    return false;
  }
  return true;
}

async function loadProfiles() {
  const client = getSupabaseClient();
  if (!client) {
    setMessage('Supabase client is not available.', 'error');
    return;
  }
  const { data, error } = await client.from('profiles').select('*');
  if (error) {
    console.error('loadProfiles error:', error);
    return;
  }
  state.profiles = data || [];
}

async function loadDonors() {
  const client = getSupabaseClient();
  if (!client) return;
  const { data, error } = await client.from('donors').select('*').order('created_at', { ascending: false });
  if (error) {
    console.error('loadDonors error:', error);
    setMessage(`Donors load failed: ${error.message}`, 'error');
    return;
  }
  state.donors = data || [];
}

async function loadRequests() {
  const client = getSupabaseClient();
  if (!client) return;
  const { data, error } = await client.from('blood_requests').select('*').order('created_at', { ascending: false });
  if (error) {
    console.error('loadRequests error:', error);
    setMessage(`Requests load failed: ${error.message}`, 'error');
    return;
  }
  state.requests = data || [];
}

async function loadData() {
  await Promise.all([loadProfiles(), loadDonors(), loadRequests()]);
  populateSearchOptions();
  updateDashboard();
  updateHeroStats();
  renderDonorList();
  renderRequestList();
  renderSearchResults();
  updateCompatibilityOptions();
  renderCompatibilityResult();
  renderUserManagement();
  renderActivityFeed();
  showEmergencyBanner();
  renderProfile();
}

async function ensureProfile(user) {
  const client = getSupabaseClient();
  if (!client) return;
  const { data, error } = await client.from('profiles').select('*').eq('id', user.id).single();
  if (error && error.code !== 'PGRST116') {
    console.error('ensureProfile error:', error);
    return;
  }
  if (!data) {
    const profile = {
      id: user.id,
      donor_name: user.user_metadata?.donor_name || user.email,
      email: user.email,
      role: 'user'
    };
    await client.from('profiles').insert(profile);
    state.profile = profile;
  } else {
    state.profile = data;
  }
}

async function initAuth() {
  const client = getSupabaseClient();
  if (!client) {
    setMessage('Supabase client is unavailable.', 'error');
    return;
  }

  const { data, error } = await client.auth.getSession();
  if (error) {
    console.error('getSession error:', error);
    setMessage(`Session error: ${error.message}`, 'error');
    return;
  }

  state.session = data.session;
  if (state.session) {
    await ensureProfile(state.session.user);
  }
  updateUserMenu();
  await loadData();

  client.auth.onAuthStateChange(async (event, session) => {
    logAction('Auth state changed', event);
    state.session = session;
    if (session) {
      await ensureProfile(session.user);
      updateUserMenu();
      await loadData();
      setMessage('Welcome back!', 'success');
    } else {
      state.profile = null;
      updateUserMenu();
      await loadData();
      setMessage('You have been signed out.', 'success');
    }
  });
}

async function handleGoogleLogin() {
  const client = getSupabaseClient();
  if (!client) {
    setMessage('Supabase client is not available.', 'error');
    return;
  }
  const { error } = await client.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.origin }
  });
  if (error) {
    setMessage(`Google login failed: ${error.message}`, 'error');
  } else {
    setMessage('Redirecting to Google login...', 'success');
  }
}

async function handleLogout() {
  const client = getSupabaseClient();
  if (!client) {
    setMessage('Supabase client is not available.', 'error');
    return;
  }
  const { error } = await client.auth.signOut();
  if (error) {
    setMessage(`Logout failed: ${error.message}`, 'error');
    return;
  }
  state.session = null;
  state.profile = null;
  updateUserMenu();
  setMessage('You have been logged out.', 'success');
}

function updateHeroStats() {
  const active = state.donors.filter((d) => d.availability_status === 'Available').length;
  const heroDonorCount = document.getElementById('heroDonorCount');
  const heroRequestCount = document.getElementById('heroRequestCount');
  const heroUserCount = document.getElementById('heroUserCount');
  if (heroDonorCount) heroDonorCount.textContent = active;
  if (heroRequestCount) heroRequestCount.textContent = state.requests.length;
  if (heroUserCount) heroUserCount.textContent = state.profiles.length;
}

function updateDashboard() {
  const totalDonors = state.donors.length;
  const activeDonors = state.donors.filter((d) => d.availability_status === 'Available').length;
  const totalRequests = state.requests.length;
  const emergencyRequests = state.requests.filter((r) => ['Critical', 'High'].includes(r.emergency_level)).length;

  const metricDonors = document.getElementById('metricDonors');
  const metricActive = document.getElementById('metricActive');
  const metricRequests = document.getElementById('metricRequests');
  const metricEmergency = document.getElementById('metricEmergency');
  if (metricDonors) metricDonors.textContent = totalDonors;
  if (metricActive) metricActive.textContent = activeDonors;
  if (metricRequests) metricRequests.textContent = totalRequests;
  if (metricEmergency) metricEmergency.textContent = emergencyRequests;

  const groupCounts = {};
  state.donors.forEach((donor) => {
    groupCounts[donor.blood_group] = (groupCounts[donor.blood_group] || 0) + 1;
  });

  const chart = document.getElementById('distributionChart');
  if (chart) {
    chart.innerHTML = Object.entries(groupCounts)
      .map(([group, count]) => `
        <div class="chart-row">
          <span>${group}</span>
          <div class="chart-track"><div class="chart-fill" style="width:${Math.max(10, (count / Math.max(totalDonors, 1)) * 100)}%"></div></div>
          <strong>${count}</strong>
        </div>
      `)
      .join('');
  }

  const monthlyChart = document.getElementById('monthlyChart');
  if (monthlyChart) {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'];
    monthlyChart.innerHTML = months
      .map((month, index) => `
        <div class="chart-row">
          <span>${month}</span>
          <div class="chart-track"><div class="chart-fill" style="width:${Math.max(12, (index + 1) * 12)}%"></div></div>
          <strong>${index + 2}</strong>
        </div>
      `)
      .join('');
  }
}

function renderActivityFeed() {
  const feed = document.getElementById('activityFeed');
  if (!feed) return;
  feed.innerHTML = state.requests.slice(0, 6).map((request) => `
    <div class="card">
      <strong>${request.patient_name}</strong>
      <p>${request.blood_group_needed} • ${request.hospital_name}</p>
      <small>${request.status || 'Pending'} • ${formatDate(request.created_at)}</small>
    </div>
  `).join('');
}

function renderUserManagement() {
  const container = document.getElementById('userManagement');
  if (!container) return;
  container.innerHTML = state.profiles.map((profile) => `
    <div class="card">
      <strong>${profile.donor_name || profile.email}</strong>
      <p>${profile.email || 'No email'}</p>
      <span class="badge">${profile.role || 'user'}</span>
    </div>
  `).join('');
}

function populateSearchOptions() {
  const searchCity = document.getElementById('searchCity');
  const searchDistrict = document.getElementById('searchDistrict');
  if (!searchCity || !searchDistrict) return;

  const cities = [...new Set(state.donors.map((d) => d.city).filter(Boolean))].sort();
  const districts = [...new Set(state.donors.map((d) => d.district).filter(Boolean))].sort();

  searchCity.innerHTML = '<option value="">All Cities</option>' + cities.map((city) => `<option value="${city}">${city}</option>`).join('');
  searchDistrict.innerHTML = '<option value="">All Districts</option>' + districts.map((district) => `<option value="${district}">${district}</option>`).join('');
}

function updateCompatibilityOptions() {
  const donorSelect = document.getElementById('compatibilityDonor');
  const recipientSelect = document.getElementById('compatibilityRecipient');
  if (!donorSelect || !recipientSelect) return;
  donorSelect.innerHTML = '<option value="">Select donor group</option>' + BLOOD_GROUPS.map((g) => `<option value="${g}">${g}</option>`).join('');
  recipientSelect.innerHTML = '<option value="">Select recipient group</option>' + BLOOD_GROUPS.map((g) => `<option value="${g}">${g}</option>`).join('');
}

function renderCompatibilityResult() {
  const donor = document.getElementById('compatibilityDonor')?.value;
  const recipient = document.getElementById('compatibilityRecipient')?.value;
  const result = document.getElementById('compatibilityResult');
  const compatibleDonors = document.getElementById('compatibleDonors');
  const compatibleRecipients = document.getElementById('compatibleRecipients');

  if (!result || !compatibleDonors || !compatibleRecipients) return;
  if (!donor || !recipient) {
    result.className = 'compatibility-result';
    result.innerHTML = 'Choose both donor and recipient groups to see compatibility.';
    compatibleDonors.innerHTML = '';
    compatibleRecipients.innerHTML = '';
    return;
  }

  const canDonate = COMPATIBILITY[donor]?.includes(recipient) || false;
  result.className = `compatibility-result ${canDonate ? 'success' : 'danger'}`;
  result.innerHTML = `<strong>${donor} ? ${recipient}</strong><div>${canDonate ? 'Compatible for donation' : 'Not compatible for donation'}</div>`;

  compatibleDonors.innerHTML = BLOOD_GROUPS.filter((group) => COMPATIBILITY[group]?.includes(recipient)).map((group) => `<div class="compatibility-chip">${group}</div>`).join('');
  compatibleRecipients.innerHTML = BLOOD_GROUPS.filter((group) => COMPATIBILITY[donor]?.includes(group)).map((group) => `<div class="compatibility-chip">${group}</div>`).join('');
}

function renderDonorList() {
  const container = document.getElementById('donorList');
  if (!container) return;
  if (!state.donors.length) {
    container.innerHTML = '<div class="empty-state">No donors yet.</div>';
    return;
  }

  const donorRows = state.donors
    .filter((donor) => {
      const input = document.getElementById('donorSearchInput')?.value?.toLowerCase() || '';
      return !input || `${donor.donor_name} ${donor.city} ${donor.blood_group}`.toLowerCase().includes(input);
    })
    .map((donor) => `
      <tr>
        <td><strong>${donor.donor_name}</strong><br><small>${donor.age} yrs</small></td>
        <td>${donor.blood_group}</td>
        <td>${donor.city}</td>
        <td>${donor.district || '—'}</td>
        <td>${donor.availability_status}</td>
        <td>${state.session ? donor.phone : maskPhone(donor.phone)}</td>
        <td>
          <div class="table-actions">
            <button class="btn btn-small btn-secondary" onclick="editDonor('${donor.id}')">Edit</button>
            <button class="btn btn-small btn-secondary" onclick="toggleAvailability('${donor.id}')">Toggle</button>
            <button class="btn btn-small btn-secondary" onclick="showDonorCard('${donor.id}')">Card</button>
            <button class="btn btn-small btn-danger" onclick="deleteDonor('${donor.id}')">Delete</button>
          </div>
        </td>
      </tr>
    `)
    .join('');

  container.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Name</th>
          <th>Blood</th>
          <th>City</th>
          <th>District</th>
          <th>Status</th>
          <th>Contact</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>${donorRows}</tbody>
    </table>
  `;
}

function renderRequestList() {
  const container = document.getElementById('requestList');
  if (!container) return;
  if (!state.requests.length) {
    container.innerHTML = '<div class="empty-state">No blood requests yet.</div>';
    return;
  }
  container.innerHTML = state.requests.map((request) => `
    <div class="request-card ${request.emergency_level === 'Critical' ? 'urgent' : ''}">
      <div>
        <div class="request-top">
          <h3>${request.patient_name}</h3>
          <span class="badge">${request.status || 'Pending'}</span>
        </div>
        <p><strong>Hospital:</strong> ${request.hospital_name}</p>
        <p><strong>Blood:</strong> ${request.blood_group_needed} • ${request.units_required} units</p>
        <p><strong>Contact:</strong> ${state.session ? request.contact_number : maskPhone(request.contact_number)}</p>
      </div>
      <div class="card-actions">
        <button class="btn btn-small btn-secondary" onclick="updateRequestStatus('${request.id}', 'Accepted')">Accept</button>
        <button class="btn btn-small btn-secondary" onclick="updateRequestStatus('${request.id}', 'Completed')">Complete</button>
        <button class="btn btn-small btn-secondary" onclick="editRequest('${request.id}')">Edit</button>
        <button class="btn btn-small btn-danger" onclick="deleteRequest('${request.id}')">Delete</button>
      </div>
    </div>
  `).join('');
}

function renderSearchResults() {
  const container = document.getElementById('searchResults');
  const bloodFilter = document.getElementById('searchBlood')?.value || '';
  const cityFilter = document.getElementById('searchCity')?.value || '';
  const districtFilter = document.getElementById('searchDistrict')?.value || '';
  const statusFilter = document.getElementById('searchAvailability')?.value || '';

  if (!container) return;

  let filtered = state.donors.filter((donor) => {
    const matchBlood = !bloodFilter || donor.blood_group === bloodFilter;
    const matchCity = !cityFilter || donor.city === cityFilter;
    const matchDistrict = !districtFilter || donor.district === districtFilter;
    const matchStatus = !statusFilter || donor.availability_status === statusFilter;
    return matchBlood && matchCity && matchDistrict && matchStatus;
  });

  if (state.sortByNearest && state.userLocation) {
    filtered = filtered
      .map((donor) => ({
        ...donor,
        distance: donor.latitude && donor.longitude
          ? haversineDistance(state.userLocation.latitude, state.userLocation.longitude, donor.latitude, donor.longitude)
          : Number.MAX_SAFE_INTEGER
      }))
      .sort((a, b) => a.distance - b.distance);
  }

  if (!filtered.length) {
    container.innerHTML = '<div class="empty-state">No donors match your search.</div>';
    return;
  }

  container.innerHTML = filtered.map((donor) => `
    <div class="card">
      <div class="request-top">
        <strong>${donor.donor_name}</strong>
        <span class="badge">${getBadge(donor.donation_count || 0)}</span>
      </div>
      <p>${donor.blood_group} • ${donor.city} • ${donor.district || 'District not listed'}</p>
      <p>${state.session ? donor.phone : maskPhone(donor.phone)}</p>
      <p>${donor.availability_status}</p>
      ${donor.distance !== undefined ? `<small>${donor.distance.toFixed(1)} km away</small>` : ''}
      <div class="card-actions">
        <button class="btn btn-small btn-secondary" onclick="window.open('tel:${donor.phone}')">Call</button>
        <button class="btn btn-small btn-primary" onclick="window.open('https://wa.me/${donor.phone}')">WhatsApp</button>
      </div>
    </div>
  `).join('');
}

function renderProfile() {
  const container = document.getElementById('profileContent');
  if (!container) return;
  if (!state.session || !state.profile) {
    container.innerHTML = '<div class="profile-card"><h3>Login required</h3><p>Please sign in to view your profile.</p></div>';
    return;
  }
  const donorProfile = state.donors.find((d) => d.user_id === state.session.user.id) || null;
  container.innerHTML = `
    <div class="profile-card">
      <div class="profile-head">
        <div>
          <p class="eyebrow">Profile</p>
          <h3>${state.profile.donor_name || state.profile.email}</h3>
        </div>
        <span class="badge">${state.profile.role || 'user'}</span>
      </div>
      <p><strong>Email:</strong> ${state.profile.email || '—'}</p>
      <p><strong>Blood Group:</strong> ${donorProfile?.blood_group || 'Not listed'}</p>
      <p><strong>City:</strong> ${donorProfile?.city || '—'}</p>
      <p><strong>Status:</strong> ${donorProfile?.availability_status || 'Not available'}</p>
    </div>
  `;
}

function showDonorCard(id) {
  const donor = state.donors.find((item) => item.id === id);
  if (!donor) return;
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(donor.id)}`;
  const container = document.getElementById('profileContent');
  if (!container) return;
  container.innerHTML = `
    <div class="profile-card">
      <div class="profile-head">
        <div>
          <p class="eyebrow">Digital Donor Card</p>
          <h3>${donor.donor_name}</h3>
        </div>
        <span class="badge">${donor.blood_group}</span>
      </div>
      <p><strong>Phone:</strong> ${state.session ? donor.phone : maskPhone(donor.phone)}</p>
      <p><strong>City:</strong> ${donor.city}</p>
      <p><strong>Status:</strong> ${donor.availability_status}</p>
      <img src="${qrUrl}" alt="QR code" />
    </div>
  `;
  showSection('profile');
}

async function saveDonor(formData, formElement) {
  if (!requireAuth()) return;
  const payload = {
    donor_name: formData.get('donor_name'),
    phone: formData.get('phone'),
    blood_group: formData.get('blood_group'),
    age: Number(formData.get('age')),
    gender: formData.get('gender'),
    city: formData.get('city'),
    district: formData.get('district') || null,
    address: formData.get('address'),
    last_donation_date: formData.get('last_donation_date') || null,
    availability_status: formData.get('availability_status') || 'Available'
  };
  const client = getSupabaseClient();
  if (!client) return;
  try {
    if (state.editingDonorId) {
      const { error } = await client.from('donors').update(payload).eq('id', state.editingDonorId);
      if (error) throw error;
      state.editingDonorId = null;
      setMessage('Donor updated successfully.', 'success');
    } else {
      const { error } = await client.from('donors').insert({ ...payload, user_id: state.session?.user?.id || null });
      if (error) throw error;
      setMessage('Donor saved successfully.', 'success');
    }
    formElement.reset();
    await loadDonors();
    updateHeroStats();
    updateDashboard();
    renderDonorList();
    renderSearchResults();
    populateSearchOptions();
  } catch (error) {
    setMessage(`Save donor failed: ${error.message}`, 'error');
  }
}

async function deleteDonor(id) {
  if (!requireAuth()) return;
  const client = getSupabaseClient();
  if (!client) return;
  try {
    const { error } = await client.from('donors').delete().eq('id', id);
    if (error) throw error;
    await loadDonors();
    updateHeroStats();
    updateDashboard();
    renderDonorList();
    renderSearchResults();
    populateSearchOptions();
    setMessage('Donor deleted successfully.', 'success');
  } catch (error) {
    setMessage(`Delete donor failed: ${error.message}`, 'error');
  }
}

async function toggleAvailability(id) {
  if (!requireAuth()) return;
  const donor = state.donors.find((item) => item.id === id);
  if (!donor) return;
  const next = donor.availability_status === 'Available' ? 'Busy' : 'Available';
  const client = getSupabaseClient();
  if (!client) return;
  try {
    const { error } = await client.from('donors').update({ availability_status: next }).eq('id', id);
    if (error) throw error;
    await loadDonors();
    updateDashboard();
    updateHeroStats();
    renderDonorList();
    renderSearchResults();
    setMessage(`Availability updated to ${next}.`, 'success');
  } catch (error) {
    setMessage(`Update availability failed: ${error.message}`, 'error');
  }
}

async function editDonor(id) {
  const donor = state.donors.find((item) => item.id === id);
  if (!donor) return;
  state.editingDonorId = id;

  const donorIdInput = document.querySelector('[name="donorId"]');
  document.querySelector('[name="donor_name"]').value = donor.donor_name || '';
  document.querySelector('[name="phone"]').value = donor.phone || '';
  document.querySelector('[name="blood_group"]').value = donor.blood_group || '';
  document.querySelector('[name="age"]').value = donor.age || '';
  document.querySelector('[name="gender"]').value = donor.gender || '';
  document.querySelector('[name="city"]').value = donor.city || '';
  document.querySelector('[name="district"]').value = donor.district || '';
  document.querySelector('[name="address"]').value = donor.address || '';
  document.querySelector('[name="last_donation_date"]').value = donor.last_donation_date || '';
  document.querySelector('[name="availability_status"]').value = donor.availability_status || 'Available';
  if (donorIdInput) donorIdInput.value = donor.id;
  showSection('donors');
}

async function saveRequest(formData, formElement) {
  if (!requireAuth()) return;
  const payload = {
    patient_name: formData.get('patient_name'),
    blood_group_needed: formData.get('blood_group_needed'),
    hospital_name: formData.get('hospital_name'),
    contact_number: formData.get('contact_number'),
    emergency_level: formData.get('emergency_level'),
    units_required: Number(formData.get('units_required')),
    status: 'Pending'
  };
  const client = getSupabaseClient();
  if (!client) return;
  try {
    if (state.editingRequestId) {
      const { error } = await client.from('blood_requests').update(payload).eq('id', state.editingRequestId);
      if (error) throw error;
      state.editingRequestId = null;
      setMessage('Request updated successfully.', 'success');
    } else {
      const { error } = await client.from('blood_requests').insert({ ...payload, user_id: state.session?.user?.id || null });
      if (error) throw error;
      setMessage('Request created successfully.', 'success');
    }
    formElement.reset();
    await loadRequests();
    renderRequestList();
    updateDashboard();
    showEmergencyBanner();
  } catch (error) {
    setMessage(`Save request failed: ${error.message}`, 'error');
  }
}

async function deleteRequest(id) {
  if (!requireAuth()) return;
  const client = getSupabaseClient();
  if (!client) return;
  try {
    const { error } = await client.from('blood_requests').delete().eq('id', id);
    if (error) throw error;
    await loadRequests();
    renderRequestList();
    updateDashboard();
    showEmergencyBanner();
    setMessage('Request deleted successfully.', 'success');
  } catch (error) {
    setMessage(`Delete request failed: ${error.message}`, 'error');
  }
}

async function updateRequestStatus(id, status) {
  if (!requireAuth()) return;
  const client = getSupabaseClient();
  if (!client) return;
  try {
    const { error } = await client.from('blood_requests').update({ status }).eq('id', id);
    if (error) throw error;
    await loadRequests();
    renderRequestList();
    updateDashboard();
    showEmergencyBanner();
    setMessage(`Request marked as ${status}.`, 'success');
  } catch (error) {
    setMessage(`Update status failed: ${error.message}`, 'error');
  }
}

async function editRequest(id) {
  const request = state.requests.find((item) => item.id === id);
  if (!request) return;
  state.editingRequestId = id;

  document.querySelector('[name="requestId"]').value = request.id;
  document.querySelector('[name="patient_name"]').value = request.patient_name || '';
  document.querySelector('[name="blood_group_needed"]').value = request.blood_group_needed || '';
  document.querySelector('[name="hospital_name"]').value = request.hospital_name || '';
  document.querySelector('[name="contact_number"]').value = request.contact_number || '';
  document.querySelector('[name="emergency_level"]').value = request.emergency_level || 'Medium';
  document.querySelector('[name="units_required"]').value = request.units_required || '';
  showSection('requests');
}

function showEmergencyBanner() {
  const banner = document.getElementById('alertBanner');
  if (!banner) return;
  const urgent = state.requests.find((request) => request.emergency_level === 'Critical');
  if (urgent) {
    const matching = state.donors.filter((donor) => donor.blood_group === urgent.blood_group_needed && donor.availability_status === 'Available').length;
    banner.innerHTML = `<strong>Emergency Alert:</strong> ${urgent.blood_group_needed} needed at ${urgent.hospital_name} (${matching} matching donors available).`;
    banner.style.display = 'block';
  } else {
    banner.style.display = 'none';
  }
}

function attachEvents() {
  const googleLoginBtn = document.getElementById('googleLoginBtn');
  const loginBtn = document.getElementById('loginBtn');
  const logoutBtn = document.getElementById('logoutBtn');
  const themeToggle = document.getElementById('themeToggle');
  const donorForm = document.getElementById('donorForm');
  const cancelDonorEdit = document.getElementById('cancelDonorEdit');
  const requestForm = document.getElementById('requestForm');
  const cancelRequestEdit = document.getElementById('cancelRequestEdit');
  const searchBlood = document.getElementById('searchBlood');
  const searchCity = document.getElementById('searchCity');
  const searchDistrict = document.getElementById('searchDistrict');
  const searchAvailability = document.getElementById('searchAvailability');
  const donorSearchInput = document.getElementById('donorSearchInput');
  const sortNearestBtn = document.getElementById('sortNearestBtn');
  const locateBtn = document.getElementById('locateBtn');
  const donorCompatibility = document.getElementById('compatibilityDonor');
  const recipientCompatibility = document.getElementById('compatibilityRecipient');

  if (googleLoginBtn) {
    googleLoginBtn.addEventListener('click', () => handleGoogleLogin());
  }
  if (loginBtn) {
    loginBtn.addEventListener('click', () => handleGoogleLogin());
  }
  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => handleLogout());
  }
  if (themeToggle) {
    themeToggle.addEventListener('click', () => {
      document.body.classList.toggle('dark');
      themeToggle.textContent = document.body.classList.contains('dark') ? '☀️' : '🌙';
    });
  }
  document.querySelectorAll('[data-section]').forEach((button) => {
    button.addEventListener('click', () => {
      showSection(button.dataset.section);
    });
  });

  if (donorForm) {
    donorForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      await saveDonor(new FormData(donorForm), donorForm);
    });
  }
  if (cancelDonorEdit) {
    cancelDonorEdit.addEventListener('click', () => {
      donorForm?.reset();
      state.editingDonorId = null;
      setMessage('Donor edit cancelled.', 'success');
    });
  }
  if (requestForm) {
    requestForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      await saveRequest(new FormData(requestForm), requestForm);
    });
  }
  if (cancelRequestEdit) {
    cancelRequestEdit.addEventListener('click', () => {
      requestForm?.reset();
      state.editingRequestId = null;
      setMessage('Request edit cancelled.', 'success');
    });
  }
  if (searchBlood) searchBlood.addEventListener('input', renderSearchResults);
  if (searchCity) searchCity.addEventListener('change', renderSearchResults);
  if (searchDistrict) searchDistrict.addEventListener('change', renderSearchResults);
  if (searchAvailability) searchAvailability.addEventListener('change', renderSearchResults);
  if (donorSearchInput) donorSearchInput.addEventListener('input', renderDonorList);
  if (sortNearestBtn) {
    sortNearestBtn.addEventListener('click', () => {
      state.sortByNearest = !state.sortByNearest;
      sortNearestBtn.textContent = state.sortByNearest ? 'Show by Availability' : 'Sort by Nearest';
      renderSearchResults();
    });
  }
  if (locateBtn) {
    locateBtn.addEventListener('click', () => {
      if (!navigator.geolocation) {
        setMessage('Geolocation is not supported by this browser.', 'error');
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          state.userLocation = {
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude
          };
          setMessage('Location detected successfully.', 'success');
          renderSearchResults();
        },
        () => {
          setMessage('Unable to access your location.', 'error');
        }
      );
    });
  }
  if (donorCompatibility) donorCompatibility.addEventListener('change', renderCompatibilityResult);
  if (recipientCompatibility) recipientCompatibility.addEventListener('change', renderCompatibilityResult);
}

async function testConnection() {
  const client = getSupabaseClient();
  if (!client) {
    setMessage('Supabase client failed to initialize.', 'error');
    return;
  }
  try {
    const { data, error } = await client.from('donors').select('*').limit(1);
    if (error) throw error;
    setMessage('Supabase connection successful.', 'success');
  } catch (error) {
    setMessage(`Database connection failed: ${error.message}`, 'error');
  }
}

window.addEventListener('DOMContentLoaded', async () => {
  attachEvents();
  showSection('home');
  updateCompatibilityOptions();
  renderCompatibilityResult();
  await testConnection();
  await initAuth();
  showEmergencyBanner();
});

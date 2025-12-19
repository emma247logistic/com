// Emma247 Logistics Frontend Logic

// --- Supabase Client Setup ---
const SUPABASE_URL = "https://qqfpwjhsmrvmuankmvfo.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFxZnB3amhzbXJ2bXVhbmttdmZvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU5NDkyOTksImV4cCI6MjA4MTUyNTI5OX0.RcehX1DcUSI3D36HU7ecmwVLZ8u1EfV1u_n1PuPMUWw";

let supabaseClient = null;
try {
  if (window.supabase && typeof window.supabase.createClient === "function") {
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  } else {
    console.error("Supabase library not loaded. Check the <script> tag for @supabase/supabase-js.");
  }
} catch (err) {
  console.error("Failed to initialise Supabase client:", err);
}

// --- Helpers ---
const $ = (id) => document.getElementById(id);

const ADMIN_WHATSAPP_NUMBER = "2348023384070";

function openWhatsAppChat(trackingNumber = "") {
  const message = trackingNumber
    ? `Hello, I need to make payment for my shipment with tracking number: ${trackingNumber}`
    : "Hello, I need to make payment for my shipment";
  const url = `https://wa.me/${ADMIN_WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
  window.open(url, "_blank");
}

// Expose to global scope for inline onclick handlers
window.openWhatsAppChat = openWhatsAppChat;

function showToast(message, duration = 3200) {
  const toast = $("toast");
  if (!toast) return;
  toast.textContent = message;
  toast.classList.remove("hidden");
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => {
    toast.classList.add("hidden");
  }, duration);
}

function formatCurrency(amount) {
  if (amount == null || Number.isNaN(amount)) return "₦0";
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(amount);
}

function countryLabel(code) {
  if (!code) return "";
  const match = countries.find((c) => c.code === code);
  return match ? match.name : code;
}

function originCityCountry(city, countryCode) {
  const country = countryLabel(countryCode);
  return city ? `${city}, ${country}` : country;
}

// --- Global State ---
let currentUser = null;
let pricePerKg = null; // legacy single rate (kept for backwards compatibility)
let couriers = [];
let courierRates = [];
let countries = [];
let cities = [];

// --- Auth UI Logic ---
function openAuthModal(mode = "signin", reason = "") {
  const modal = $("auth-modal");
  modal.classList.remove("hidden");
  if (reason) {
    $("auth-subtitle").textContent = reason;
  } else {
    $("auth-subtitle").textContent = "Sign in or create an account to continue.";
  }
  setAuthMode(mode);
}

function closeAuthModal() {
  const modal = $("auth-modal");
  modal.classList.add("hidden");
  $("auth-message").textContent = "";
  $("auth-message").className = "auth-message";
}

function setAuthMode(mode) {
  const signinForm = $("signin-form");
  const signupForm = $("signup-form");
  const tabSignin = $("tab-signin");
  const tabSignup = $("tab-signup");
  if (mode === "signin") {
    signinForm.classList.remove("hidden");
    signupForm.classList.add("hidden");
    tabSignin.classList.add("active");
    tabSignup.classList.remove("active");
  } else {
    signupForm.classList.remove("hidden");
    signinForm.classList.add("hidden");
    tabSignup.classList.add("active");
    tabSignin.classList.remove("active");
  }
}

function updateAuthUI(session) {
  currentUser = session?.user ?? null;
  const userPill = $("user-pill");
  const userEmail = $("user-email");
  const btnSignin = $("btn-open-signin");
  const btnSignup = $("btn-open-signup");
  const dashboard = $("dashboard");

  if (currentUser) {
    userPill.classList.remove("hidden");
    userEmail.textContent = currentUser.email;
    btnSignin.classList.add("hidden");
    btnSignup.classList.add("hidden");
    dashboard.classList.remove("hidden");
    loadMyShipments().catch(console.error);
  } else {
    userPill.classList.add("hidden");
    btnSignin.classList.remove("hidden");
    btnSignup.classList.remove("hidden");
    dashboard.classList.add("hidden");
    const list = $("shipments-list");
    if (list) {
      list.innerHTML = '<p>You have no shipments yet. Sign in to see them here.</p>';
      list.classList.add("empty-state");
    }
  }
}

// --- Supabase Auth Handlers ---
async function handleSignup(e) {
  e.preventDefault();
  const email = $("signup-email").value.trim();
  const password = $("signup-password").value;
  const msg = $("auth-message");
  msg.textContent = "";
  msg.className = "auth-message";

  if (!supabaseClient) {
    msg.textContent = "Supabase is not initialised. Check your internet connection.";
    msg.classList.add("error");
    return;
  }

  const { data, error } = await supabaseClient.auth.signUp({
    email,
    password,
  });

  if (error) {
    msg.textContent = error.message;
    msg.classList.add("error");
    return;
  }

  // If email confirmations are disabled in your Supabase project,
  // the user will be able to sign in immediately.
  msg.textContent = "Account created. You can sign in now.";
  msg.classList.add("success");
  setAuthMode("signin");
}

async function handleSignin(e) {
  e.preventDefault();
  const email = $("signin-email").value.trim();
  const password = $("signin-password").value;
  const msg = $("auth-message");
  msg.textContent = "";
  msg.className = "auth-message";

  if (!supabaseClient) {
    msg.textContent = "Supabase is not initialised. Check your internet connection.";
    msg.classList.add("error");
    return;
  }

  const { data, error } = await supabaseClient.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    msg.textContent = error.message;
    msg.classList.add("error");
    return;
  }

  msg.textContent = "Signed in successfully.";
  msg.classList.add("success");
  closeAuthModal();
  updateAuthUI(data.session);
  showToast("Signed in as " + email);
}

async function handleLogout() {
  if (!supabaseClient) {
    updateAuthUI(null);
    return;
  }
  await supabaseClient.auth.signOut();
  updateAuthUI(null);
  showToast("You have been signed out.");
}

// --- Rate Calculator ---
async function loadCourierPricing() {
  const ratePerKgInput = $("rate-per-kg");
  if (!supabaseClient) {
    if (ratePerKgInput) {
      ratePerKgInput.value = "Supabase not loaded";
    }
    return;
  }

  const { data: couriersData, error: couriersError } = await supabaseClient
    .from("couriers")
    .select("*")
    .eq("is_active", true)
    .order("name", { ascending: true });

  if (couriersError) {
    console.error("Error loading couriers:", couriersError);
  } else {
    couriers = couriersData || [];
    const rateSelect = $("rate-courier");
    const sendSelect = $("send-courier");

    [rateSelect, sendSelect].forEach((select) => {
      if (!select) return;
      select.innerHTML = '<option value="">Select courier</option>';
      couriers.forEach((c) => {
        const opt = document.createElement("option");
        opt.value = c.code;
        opt.textContent = c.name;
        select.appendChild(opt);
      });
    });
  }

  // Load countries
  const { data: countriesData, error: countriesError } = await supabaseClient
    .from("countries")
    .select("*")
    .eq("is_active", true)
    .order("name", { ascending: true });

  if (countriesError) {
    console.error("Error loading countries:", countriesError);
  } else {
    countries = countriesData || [];
    const originCountrySelects = [
      $("rate-origin-country"),
      $("send-origin-country"),
    ];
    const destinationCountrySelects = [
      $("rate-destination-country"),
      $("send-destination-country"),
    ];

    const allCountrySelects = [...originCountrySelects, ...destinationCountrySelects];
    allCountrySelects.forEach((select) => {
      if (!select) return;
      const isOrigin = originCountrySelects.includes(select);
      select.innerHTML = `<option value="">Select ${
        isOrigin ? "origin" : "destination"
      } country</option>`;
      countries.forEach((c) => {
        const opt = document.createElement("option");
        opt.value = c.code;
        opt.textContent = c.name;
        select.appendChild(opt);
      });
    });
  }

  // Load cities
  const { data: citiesData, error: citiesError } = await supabaseClient
    .from("cities")
    .select("*")
    .eq("is_active", true)
    .order("name", { ascending: true });

  if (citiesError) {
    console.error("Error loading cities:", citiesError);
  } else {
    cities = citiesData || [];
  }

  const { data: ratesData, error: ratesError } = await supabaseClient
    .from("courier_rates")
    .select("*");

  if (ratesError) {
    console.error("Error loading courier rates:", ratesError);
    if (ratePerKgInput) {
      ratePerKgInput.value = "Error loading rates";
    }
    return;
  }

  courierRates = ratesData || [];
  if (ratePerKgInput) {
    ratePerKgInput.value = "Select options to view rate";
  }
}

function findRatePerKg(courierCode, originCountry, destinationCountry, sizeCategory) {
  if (!courierRates || courierRates.length === 0) return null;
  const match = courierRates.find(
    (r) =>
      r.courier_code === courierCode &&
      r.origin_country.toLowerCase() === originCountry.toLowerCase() &&
      r.destination_country.toLowerCase() === destinationCountry.toLowerCase() &&
      r.size_category === sizeCategory
  );
  return match ? Number(match.price_per_kg_ngn) : null;
}

function populateCitySelect(selectId, countryCode) {
  const select = $(selectId);
  if (!select) return;
  select.innerHTML = `<option value="">Select ${selectId.includes("origin") ? "origin" : "destination"} city</option>`;
  if (!countryCode) return;
  const filtered = cities.filter((c) => c.country_code === countryCode);
  filtered.forEach((c) => {
    const opt = document.createElement("option");
    opt.value = c.name;
    opt.textContent = c.name;
    select.appendChild(opt);
  });
}

function handleRateForm(e) {
  e.preventDefault();
  const courierCode = $("rate-courier").value;
  const sizeCategory = $("rate-size").value;
  const originCountry = $("rate-origin-country").value.trim();
  const origin = $("rate-origin").value.trim();
  const destinationCountry = $("rate-destination-country").value.trim();
  const destination = $("rate-destination").value.trim();
  const weight = parseFloat($("rate-weight").value);
  const result = $("rate-result");

  if (!courierCode || !sizeCategory || !originCountry || !destinationCountry || !origin || !destination || !weight || weight <= 0) {
    result.textContent = "Please fill all fields with valid values.";
    result.classList.remove("hidden");
    return;
  }

  const rate = findRatePerKg(courierCode, originCountry, destinationCountry, sizeCategory);
  if (!rate) {
    result.textContent =
      "No rate configured in Supabase for this courier, route and size. Please contact admin.";
    result.classList.remove("hidden");
    return;
  }

  const base = rate * weight;
  const total = Math.round(base);

  result.innerHTML = `
    Courier: <strong>${courierCode}</strong><br/>
    Route: <strong>${originCityCountry(origin, originCountry)}</strong> to
    <strong>${originCityCountry(destination, destinationCountry)}</strong><br/>
    Size: <strong>${sizeCategory}</strong>, Weight: <strong>${weight}kg</strong><br/>
    Rate: <strong>${formatCurrency(rate)}</strong> per kg<br/>
    <strong>${formatCurrency(total)}</strong>
    <br/><span style="opacity:0.75;font-size:0.78rem;">(Configured from Supabase based on courier, route and size.)</span>
  `;
  result.classList.remove("hidden");
}

// --- Shipments Logic ---
function generateTrackingNumber() {
  const now = new Date();
  const year = now.getFullYear();
  const rand = Math.floor(Math.random() * 90000) + 10000;
  return `EM247-${year}-${rand}`;
}

async function loadMyShipments() {
  if (!currentUser) return;
  if (!supabaseClient) return;
  const { data, error } = await supabaseClient
    .from("shipments")
    .select("*")
    .eq("user_id", currentUser.id)
    .order("created_at", { ascending: false });

  const list = $("shipments-list");
  if (error) {
    console.error("Error loading shipments:", error);
    list.innerHTML = "<p>Failed to load your shipments.</p>";
    list.classList.add("empty-state");
    return;
  }

  if (!data || data.length === 0) {
    list.innerHTML =
      "<p>You have no shipments yet. Use “Send a Shipment” to create one.</p>";
    list.classList.add("empty-state");
    return;
  }

  list.classList.remove("empty-state");
  let html = `
    <div class="shipment-row shipment-row-header">
      <div>Tracking Number</div>
      <div>Route</div>
      <div>Weight</div>
      <div>Current Location</div>
      <div>Actions</div>
    </div>
  `;

  for (const s of data) {
    const statusClass =
      s.status === "delivered" ? "status-delivered" : "status-in-transit";
    const canDelete = s.status === "delivered";
    const deleteBtn = canDelete
      ? `<button class="btn btn-ghost btn-xs" data-delete-id="${s.id}">Delete</button>`
      : "";

    html += `
      <div class="shipment-row">
        <div class="shipment-tracking">
          ${s.tracking_number}
          <br/>
          <span style="font-size:0.7rem;opacity:0.75;">${s.courier_code || ""}</span>
        </div>
        <div class="shipment-route">
          ${originCityCountry(s.origin, s.origin_country || "")}
          →
          ${originCityCountry(s.destination, s.destination_country || "")}
        </div>
        <div class="shipment-cost">
          ${s.weight_kg} kg<br/><span>${formatCurrency(s.total_price_ngn)}</span>
        </div>
        <div class="shipment-location">${s.current_location || "Not set"}</div>
        <div class="shipment-actions">
          <span class="shipment-status ${statusClass}">${s.status}</span>
          <button class="btn btn-ghost btn-xs" data-whatsapp="${s.tracking_number}" title="Contact Admin for Payment">💬 Pay</button>
          ${deleteBtn}
        </div>
      </div>
    `;
  }

  list.innerHTML = html;

  // Wire up buttons
  list.querySelectorAll("[data-whatsapp]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const trackingNumber = btn.getAttribute("data-whatsapp");
      openWhatsAppChat(trackingNumber);
    });
  });
  list.querySelectorAll("[data-delete-id]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.getAttribute("data-delete-id");
      if (!confirm("Delete this shipment? This cannot be undone.")) return;
      const { error: delError } = await supabaseClient
        .from("shipments")
        .delete()
        .eq("id", id)
        .eq("user_id", currentUser.id);
      if (delError) {
        console.error(delError);
        showToast("Failed to delete shipment.");
        return;
      }
      showToast("Shipment deleted.");
      loadMyShipments();
    });
  });
}

async function handleSendShipment(e) {
  e.preventDefault();
  if (!currentUser) {
    openAuthModal("signin", "Please sign in or sign up to send a shipment.");
    return;
  }

  const courierCode = $("send-courier").value;
  const sizeCategory = $("send-size").value;
  const originCountry = $("send-origin-country").value.trim();
  const origin = $("send-origin").value.trim();
  const destinationCountry = $("send-destination-country").value.trim();
  const destination = $("send-destination").value.trim();
  const weight = parseFloat($("send-weight").value);
  const description = $("send-description").value.trim();
  const result = $("send-result");
  result.textContent = "";

  if (
    !courierCode ||
    !sizeCategory ||
    !originCountry ||
    !origin ||
    !destinationCountry ||
    !destination ||
    !weight ||
    weight <= 0 ||
    !description
  ) {
    result.textContent = "Please fill all fields with valid values.";
    return;
  }

  const rate = findRatePerKg(courierCode, originCountry, destinationCountry, sizeCategory);
  if (!rate) {
    result.textContent =
      "No rate configured in Supabase for this courier, route and size. Please contact admin.";
    return;
  }

  const trackingNumber = generateTrackingNumber();
  const totalPrice = Math.round(weight * rate);

  const { data, error } = await supabaseClient.from("shipments").insert({
    user_id: currentUser.id,
    tracking_number: trackingNumber,
    courier_code: courierCode,
    origin_country: originCountry,
    origin,
    destination_country: destinationCountry,
    destination,
    size_category: sizeCategory,
    weight_kg: weight,
    description,
    price_per_kg_ngn: rate,
    total_price_ngn: totalPrice,
    status: "in_transit",
  });

  if (error) {
    console.error("Error creating shipment:", error);
    result.textContent = "Failed to create shipment. Please try again.";
    return;
  }

  $("send-form").reset();
  result.innerHTML = `
    <div style="margin-bottom: 1rem;">
      Shipment created successfully!<br/>
      <strong>Your tracking number:</strong> ${trackingNumber}
    </div>
    <button class="btn btn-primary" onclick="openWhatsAppChat('${trackingNumber}')" style="width: 100%;">
      💬 Contact Admin for Payment
    </button>
  `;
  loadMyShipments();
}

async function handleTrackSubmit(e) {
  e.preventDefault();
  const trackingNumber = $("track-number").value.trim();
  const result = $("track-result");
  result.textContent = "";

  if (!trackingNumber) {
    result.textContent = "Please enter a tracking number.";
    return;
  }

  if (!currentUser) {
    openAuthModal(
      "signin",
      "Sign in or sign up to track your shipment with this tracking number."
    );
    return;
  }

  // User must own this shipment
  const { data, error } = await supabaseClient
    .from("shipments")
    .select("*")
    .eq("tracking_number", trackingNumber)
    .eq("user_id", currentUser.id)
    .maybeSingle();

  if (error) {
    console.error("Error tracking shipment:", error);
    result.textContent = "Failed to track shipment. Please try again.";
    return;
  }

  if (!data) {
    result.textContent = "No shipment found with that tracking number in your account.";
    return;
  }

  const s = data;
  result.innerHTML = `
    <strong>Tracking:</strong> ${s.tracking_number}<br/>
    <strong>Courier:</strong> ${s.courier_code || "N/A"}<br/>
    <strong>Route:</strong> ${originCityCountry(
      s.origin,
      s.origin_country || ""
    )} → ${originCityCountry(s.destination, s.destination_country || "")}<br/>
    <strong>Size:</strong> ${s.size_category || "N/A"}<br/>
    <strong>Status:</strong> ${s.status}<br/>
    <strong>Current Location:</strong> ${s.current_location || "Not yet updated"}<br/>
    <strong>Weight:</strong> ${s.weight_kg}kg<br/>
    <strong>Amount:</strong> ${formatCurrency(s.total_price_ngn)}
  `;
}

// --- Hero Snapshot ---
async function loadHeroSnapshot() {
  if (!supabaseClient) return;
  const { count, error } = await supabaseClient
    .from("shipments")
    .select("*", { count: "exact", head: true })
    .eq("status", "in_transit");

  if (error) {
    console.error("Failed to load hero snapshot:", error);
    return;
  }
  $("hero-active-count").textContent = count ?? 0;
}

// --- Event Listeners ---
function wireEvents() {
  const rateForm = $("rate-form");
  if (rateForm) rateForm.addEventListener("submit", handleRateForm);

  const sendForm = $("send-form");
  if (sendForm) sendForm.addEventListener("submit", handleSendShipment);

  const trackForm = $("track-form");
  if (trackForm) trackForm.addEventListener("submit", handleTrackSubmit);

  const btnSignin = $("btn-open-signin");
  if (btnSignin) {
    btnSignin.addEventListener("click", () =>
      openAuthModal("signin", "Sign in to access your Emma247 Logistics account.")
    );
  }

  const btnSignup = $("btn-open-signup");
  if (btnSignup) {
    btnSignup.addEventListener("click", () =>
      openAuthModal("signup", "Create a free Emma247 Logistics account in seconds.")
    );
  }

  const heroShip = $("btn-hero-ship");
  if (heroShip) {
    heroShip.addEventListener("click", () =>
      currentUser
        ? document.getElementById("home").scrollIntoView({ behavior: "smooth" })
        : openAuthModal("signup", "Create an account to send a shipment.")
    );
  }

  const heroTrack = $("btn-hero-track");
  if (heroTrack) {
    heroTrack.addEventListener("click", () =>
      currentUser
        ? document.getElementById("home").scrollIntoView({ behavior: "smooth" })
        : openAuthModal("signin", "Sign in to track your shipments.")
    );
  }

  const authClose = $("auth-close");
  if (authClose) authClose.addEventListener("click", closeAuthModal);

  const tabSignin = $("tab-signin");
  if (tabSignin) tabSignin.addEventListener("click", () => setAuthMode("signin"));

  const tabSignup = $("tab-signup");
  if (tabSignup) tabSignup.addEventListener("click", () => setAuthMode("signup"));

  const linkToSignup = $("link-to-signup");
  if (linkToSignup) linkToSignup.addEventListener("click", () => setAuthMode("signup"));

  const linkToSignin = $("link-to-signin");
  if (linkToSignin) linkToSignin.addEventListener("click", () => setAuthMode("signin"));

  const signupForm = $("signup-form");
  if (signupForm) signupForm.addEventListener("submit", handleSignup);

  const signinForm = $("signin-form");
  if (signinForm) signinForm.addEventListener("submit", handleSignin);

  const btnLogout = $("btn-logout");
  if (btnLogout) btnLogout.addEventListener("click", handleLogout);

  const authModal = $("auth-modal");
  if (authModal) {
    authModal.addEventListener("click", (e) => {
      if (e.target.id === "auth-modal" || e.target.classList.contains("modal-backdrop")) {
        closeAuthModal();
      }
    });
  }

  // Dependent country -> city dropdowns
  const roc = $("rate-origin-country");
  if (roc) {
    roc.addEventListener("change", () =>
      populateCitySelect("rate-origin", roc.value)
    );
  }
  const rdc = $("rate-destination-country");
  if (rdc) {
    rdc.addEventListener("change", () =>
      populateCitySelect("rate-destination", rdc.value)
    );
  }
  const soc = $("send-origin-country");
  if (soc) {
    soc.addEventListener("change", () =>
      populateCitySelect("send-origin", soc.value)
    );
  }
  const sdc = $("send-destination-country");
  if (sdc) {
    sdc.addEventListener("change", () =>
      populateCitySelect("send-destination", sdc.value)
    );
  }
}

// --- Initialization ---
async function init() {
  const yearSpan = document.getElementById("year");
  if (yearSpan) yearSpan.textContent = new Date().getFullYear();
  wireEvents();
  await loadCourierPricing();
  if ($("hero-active-count")) {
    await loadHeroSnapshot();
  }

  const {
    data: { session },
  } = await supabaseClient.auth.getSession();
  updateAuthUI(session);

  supabaseClient.auth.onAuthStateChange((_event, newSession) => {
    updateAuthUI(newSession);
  });
}

document.addEventListener("DOMContentLoaded", init);



// ==========================================
// SUPABASE CONFIGURATION
// ==========================================

const SUPABASE_URL =
    "https://eytegghokqhukardtfxt.supabase.co";

const SUPABASE_PUBLISHABLE_KEY =
    "sb_publishable_7VKjtZKj-gugLAnUfXEDkg_NeB3XlyR";


const supabaseClient = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY
);


// =========================
// App State
// =========================

let currentUserId = null;
let currentUserName = null;
let selectedUserId = null;

let categories = [];
let expenses = [];

let selectedDate = new Date();

let calendarDate = new Date();
let calendarExpenses = {};

let dataViewMode = "both";

function showLoading() {
  const loading = document.getElementById("appLoading");

  if (loading) {
    loading.classList.remove("hidden");
  }
}

function hideLoading() {
  const loading = document.getElementById("appLoading");

  if (loading) {
    loading.classList.add("hidden");
  }
}

// =========================
// Elements
// =========================

const registrationScreen =
    document.getElementById("registrationScreen");

const app =
    document.getElementById("app");

const userChoices =
    document.getElementById("userChoices");

const pinSection =
    document.getElementById("pinSection");

const householdPin =
    document.getElementById("householdPin");

const registerButton =
    document.getElementById("registerButton");

const registrationError =
    document.getElementById("registrationError");

const currentDate =
    document.getElementById("currentDate");

const todayLabel =
    document.getElementById("todayLabel");

const dayTotal =
    document.getElementById("dayTotal");

const expenseCount =
    document.getElementById("expenseCount");

const expenseList =
    document.getElementById("expenseList");

const previousDay =
    document.getElementById("previousDay");

const nextDay =
    document.getElementById("nextDay");

const todayScreen =
    document.getElementById("todayScreen");

const calendarScreen =
    document.getElementById("calendarScreen");

const calendarMonth =
    document.getElementById("calendarMonth");

const calendarGrid =
    document.getElementById("calendarGrid");

const previousMonth =
    document.getElementById("previousMonth");

const nextMonth =
    document.getElementById("nextMonth");

const calendarTodayButton =
    document.getElementById("calendarTodayButton");

const addExpenseButton =
    document.getElementById("addExpenseButton");

const expenseModal =
    document.getElementById("expenseModal");

const closeModalButton =
    document.getElementById("closeModalButton");

const expenseForm =
    document.getElementById("expenseForm");

const amountInput =
    document.getElementById("amount");

const categoryGrid =
    document.getElementById("categoryGrid");

const noteInput =
    document.getElementById("note");

const expenseDateInput =
    document.getElementById("expenseDate");

const expenseError =
    document.getElementById("expenseError");


// =========================
// Date Helpers
// =========================

function formatDateForDatabase(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
}


function formatDateForDisplay(date) {
    return date.toLocaleDateString("en-IN", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric"
    });
}


function isToday(date) {
    const today = new Date();

    return (
        date.getFullYear() === today.getFullYear() &&
        date.getMonth() === today.getMonth() &&
        date.getDate() === today.getDate()
    );
}


function updateDateDisplay() {
    currentDate.textContent =
        formatDateForDisplay(selectedDate);

    todayLabel.textContent =
        isToday(selectedDate) ? "Today" : "";

    expenseDateInput.value =
        formatDateForDatabase(selectedDate);
}


// =========================
// Authentication
// =========================

async function ensureAuthenticated() {

    const {
        data: { session },
        error
    } = await supabaseClient.auth.getSession();

    if (error) {
        throw error;
    }

    if (session) {
        return session;
    }

    const {
        data,
        error: signInError
    } = await supabaseClient.auth.signInAnonymously();

    if (signInError) {
        throw signInError;
    }

    return data.session;
}


// =========================
// Registration
// =========================

async function checkRegistration() {

    const {
        data,
        error
    } = await supabaseClient.rpc(
        "get_current_app_user"
    );

    if (error) {
        throw error;
    }

    if (!data) {
        await showRegistrationScreen();
        return false;
    }

    currentUserId = data;

    await loadCurrentUserName();

    return true;
}


async function loadCurrentUserName() {

    const {
        data,
        error
    } = await supabaseClient
        .from("users")
        .select("name")
        .eq("id", currentUserId)
        .single();

    if (error) {
        throw error;
    }

    currentUserName = data.name;
}


async function showRegistrationScreen() {

    registrationScreen.classList.remove("hidden");
    app.classList.add("hidden");

    await loadRegistrationUsers();
}


async function loadRegistrationUsers() {

    const {
        data,
        error
    } = await supabaseClient.rpc(
        "get_registration_users"
    );

    if (error) {
        throw error;
    }

    userChoices.innerHTML = "";

    data.forEach(user => {

        const button =
            document.createElement("button");

        button.type = "button";
        button.className = "user-choice";

        button.textContent = user.name;

        button.addEventListener("click", () => {

            selectedUserId = user.id;

            document
                .querySelectorAll(".user-choice")
                .forEach(item =>
                    item.classList.remove("selected")
                );

            button.classList.add("selected");

            pinSection.classList.remove("hidden");

            householdPin.focus();

        });

        userChoices.appendChild(button);
    });
}


async function registerDevice() {

    registrationError.textContent = "";

    if (!selectedUserId) {
        registrationError.textContent =
            "Please select your name.";

        return;
    }

    const pin =
        householdPin.value.trim();

    if (!/^\d{6}$/.test(pin)) {
        registrationError.textContent =
            "Please enter the 6-digit household PIN.";

        return;
    }

    registerButton.disabled = true;
    registerButton.textContent = "Checking...";

    try {

        const {
            data,
            error
        } = await supabaseClient.rpc(
            "register_device",
            {
                p_user_id: selectedUserId,
                p_pin: pin
            }
        );

        if (error) {
            throw error;
        }

        if (!data || !data.success) {
            registrationError.textContent =
                "Incorrect PIN. Please try again.";

            return;
        }

        currentUserId =
            data.user_id;

        currentUserName =
            data.name;

        registrationScreen.classList.add("hidden");
        app.classList.remove("hidden");

        await startApp();

    } catch (error) {

        console.error(error);

        registrationError.textContent =
            "Registration failed. Please try again.";

    } finally {

        registerButton.disabled = false;
        registerButton.textContent = "Continue";
    }
}


// =========================
// Categories
// =========================

async function loadCategories() {

    const {
        data,
        error
    } = await supabaseClient
        .from("categories")
        .select("id, name, icon")
        .order("created_at");

    if (error) {
        throw error;
    }

    categories = data || [];

    renderCategories();
    renderSettingsCategories();
}


function renderCategories() {

    categoryGrid.innerHTML = "";

    categories.forEach(category => {

        const button =
            document.createElement("button");

        button.type = "button";
        button.className = "category-button";

        button.dataset.categoryId =
            category.id;

        button.innerHTML = `
            <span>${escapeHtml(category.icon || "📦")}</span>
            <small>${escapeHtml(category.name)}</small>
        `;

        button.addEventListener("click", () => {

            document
                .querySelectorAll(".category-button")
                .forEach(item =>
                    item.classList.remove("selected")
                );

            button.classList.add("selected");

            button.dataset.selected = "true";
        });

        categoryGrid.appendChild(button);
    });
}

function renderSettingsCategories() {

    const container =
        document.getElementById("settingsCategoryList");

    if (!container) {
        return;
    }

    container.innerHTML = "";

    if (!categories.length) {
        container.innerHTML = `
            <div class="empty-state">
                No categories yet.
            </div>
        `;

        return;
    }

    categories.forEach(category => {

        const row =
            document.createElement("div");

        row.className = "settings-category-row";

        row.innerHTML = `
            <div class="settings-category-info">

                <span class="settings-category-icon">
                    ${escapeHtml(category.icon || "📦")}
                </span>

                <span class="settings-category-name">
                    ${escapeHtml(category.name)}
                </span>

            </div>

            <div class="settings-category-actions">

                <button
                    type="button"
                    class="settings-category-edit"
                    data-category-id="${category.id}"
                    aria-label="Edit ${escapeHtml(category.name)}"
                >
                    ✏️
                </button>

                <button
                    type="button"
                    class="settings-category-delete"
                    data-category-id="${category.id}"
                    aria-label="Delete ${escapeHtml(category.name)}"
                >
                    🗑️
                </button>

            </div>
        `;

        container.appendChild(row);
    });
}


// =========================
// Calendar
// =========================

function formatMonthForDisplay(date) {

    return date.toLocaleDateString("en-IN", {
        month: "long",
        year: "numeric"
    });
}


function getMonthStart(date) {

    return new Date(
        date.getFullYear(),
        date.getMonth(),
        1
    );
}


function getMonthEnd(date) {

    return new Date(
        date.getFullYear(),
        date.getMonth() + 1,
        0
    );
}


async function loadCalendarExpenses() {

    const year =
        calendarDate.getFullYear();

    const month =
        calendarDate.getMonth();

    const firstDate =
        new Date(year, month, 1);

    const lastDate =
        new Date(year, month + 1, 0);

    const startDate =
        formatDateForDatabase(firstDate);

    const endDate =
        formatDateForDatabase(lastDate);


    const {
        data,
        error
    } = await supabaseClient
        .from("expenses")
        .select(`
            expense_date,
            amount,
            user_id
        `)
        .gte("expense_date", startDate)
        .lte("expense_date", endDate);

    if (error) {
        console.error(error);
        return;
    }


    let filteredExpenses = data || [];


    if (dataViewMode === "me") {

        filteredExpenses =
            filteredExpenses.filter(
                expense =>
                    expense.user_id === currentUserId
            );

    } else if (dataViewMode === "other") {

        filteredExpenses =
            filteredExpenses.filter(
                expense =>
                    expense.user_id !== currentUserId
            );
    }


    calendarExpenses = {};


    filteredExpenses.forEach(expense => {

        const date =
            expense.expense_date;

        if (!calendarExpenses[date]) {
            calendarExpenses[date] = 0;
        }

        calendarExpenses[date] +=
            Number(expense.amount);
    });
}


function renderCalendar() {

    calendarMonth.textContent =
        formatMonthForDisplay(calendarDate);

    calendarGrid.innerHTML = "";

    const monthStart =
        getMonthStart(calendarDate);

    const monthEnd =
        getMonthEnd(calendarDate);

    const firstDay =
        monthStart.getDay();

    const daysInMonth =
        monthEnd.getDate();


    // Empty cells before first day

    for (
        let i = 0;
        i < firstDay;
        i++
    ) {

        const empty =
            document.createElement("div");

        empty.className =
            "calendar-day empty";

        calendarGrid.appendChild(empty);
    }


    // Days

    for (
        let day = 1;
        day <= daysInMonth;
        day++
    ) {

        const date =
            new Date(
                calendarDate.getFullYear(),
                calendarDate.getMonth(),
                day
            );

        const dateString =
            formatDateForDatabase(date);

        const total =
            calendarExpenses[dateString] || 0;

        const button =
            document.createElement("button");

        button.type = "button";

        button.className =
            "calendar-day";


        // Today

        if (isToday(date)) {
            button.classList.add("today");
        }


        // Selected date

        if (
            formatDateForDatabase(selectedDate) ===
            dateString
        ) {
            button.classList.add("selected");
        }


        button.innerHTML = `
            <span class="calendar-day-number">
                ${day}
            </span>

            ${
                total > 0
                    ? `
                        <span class="calendar-day-total">
                            ${formatShortCurrency(total)}
                        </span>
                    `
                    : ""
            }
        `;


        button.addEventListener(
    "click",
    async () => {

        selectedDate =
            new Date(
                `${dateString}T00:00:00`
            );

        updateDateDisplay();

        showTodayScreen();

        document
            .querySelectorAll(".nav-item")
            .forEach(nav =>
                nav.classList.remove("active")
            );

        document
            .querySelector('.nav-item[data-tab="today"]')
            .classList.add("active");

        await loadExpenses();

        renderCalendar();
    }
);


        calendarGrid.appendChild(button);
    }
}

async function showCalendarScreen() {
  document.querySelectorAll(".app-screen").forEach((screen) => {
    screen.classList.add("hidden");
  });

  document.getElementById("calendarScreen").classList.remove("hidden");

  calendarDate = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1);

  await loadCalendarExpenses();
  renderCalendar();
}


function showReportsScreen() {
  document.querySelectorAll(".app-screen").forEach((screen) => {
    screen.classList.add("hidden");
  });

  document.getElementById("reportsScreen").classList.remove("hidden");
}

function showTodayScreen() {
  document.querySelectorAll(".app-screen").forEach((screen) => {
    screen.classList.add("hidden");
  });

  document.getElementById("todayScreen").classList.remove("hidden");
}



async function loadReports() {
  const now = new Date();

  const year = now.getFullYear();
  const month = now.getMonth();

  const startDate = new Date(year, month, 1);
  const endDate = new Date(year, month + 1, 0);

  const start = formatDateForSupabase(startDate);
  const end = formatDateForSupabase(endDate);

  const { data, error } = await supabaseClient
    .from("expenses")
    .select(`
      id,
      amount,
      expense_date,
      category_id,
      user_id,
      users ( name ),
      categories ( name, icon )
    `)
    .gte("expense_date", start)
    .lte("expense_date", end)
    .order("expense_date", { ascending: true });

  if (error) {
    console.error("Error loading reports:", error);
    return;
  }

let filteredExpenses = data || [];

if (dataViewMode === "me") {

  filteredExpenses = filteredExpenses.filter(
    expense => expense.user_id === currentUserId
  );

} else if (dataViewMode === "other") {

  filteredExpenses = filteredExpenses.filter(
    expense => expense.user_id !== currentUserId
  );
}

renderReports(filteredExpenses);
}

function renderReports(reportExpenses) {
  const monthTotal = reportExpenses.reduce(
    (sum, expense) => sum + Number(expense.amount),
    0
  );

  const transactionCount = reportExpenses.length;

  const dailyTotals = {};

  reportExpenses.forEach((expense) => {
    const date = expense.expense_date;

    if (!dailyTotals[date]) {
      dailyTotals[date] = 0;
    }

    dailyTotals[date] += Number(expense.amount);
  });

  const daysWithExpenses = Object.keys(dailyTotals).length;

  const dailyAverage = daysWithExpenses
    ? monthTotal / daysWithExpenses
    : 0;

  const highestDay = Object.values(dailyTotals).length
    ? Math.max(...Object.values(dailyTotals))
    : 0;

  document.getElementById("reportMonthTotal").textContent =
    formatCurrency(monthTotal);

  document.getElementById("reportTransactionCount").textContent =
    transactionCount;

  document.getElementById("reportDailyAverage").textContent =
    formatCurrency(dailyAverage);

  document.getElementById("reportHighestDay").textContent =
    formatCurrency(highestDay);

  renderCategoryReport(reportExpenses);
  renderPersonReport(reportExpenses);
renderDailySpendingChart(reportExpenses);
}

let categoryPieChart = null;

function renderCategoryReport(reportExpenses) {
  const container = document.getElementById("categoryReportList");

  if (!reportExpenses.length) {
    container.innerHTML = `
      <div class="empty-state">No expenses this month.</div>
    `;

    if (categoryPieChart) {
      categoryPieChart.destroy();
      categoryPieChart = null;
    }

    return;
  }

  const categoryTotals = {};

  reportExpenses.forEach((expense) => {
    const categoryId = expense.category_id;

    if (!categoryTotals[categoryId]) {
      categoryTotals[categoryId] = {
        name: expense.categories?.name || "Other",
        icon: expense.categories?.icon || "📦",
        total: 0
      };
    }

    categoryTotals[categoryId].total += Number(expense.amount);
  });

  const sortedCategories = Object.values(categoryTotals)
    .sort((a, b) => b.total - a.total);

  const totalSpending = sortedCategories.reduce(
    (sum, category) => sum + category.total,
    0
  );

  container.innerHTML = sortedCategories.map((category) => {
    const percentage = totalSpending
      ? Math.round((category.total / totalSpending) * 100)
      : 0;

    return `
      <div class="report-row">
        <div class="report-row-left">
          <span class="report-icon">${category.icon}</span>
          <span>${category.name}</span>
        </div>

        <strong>
          ${formatCurrency(category.total)}
          <small>${percentage}%</small>
        </strong>
      </div>
    `;
  }).join("");

  const canvas = document.getElementById("categoryPieChart");

  if (!canvas) {
    return;
  }

  if (categoryPieChart) {
    categoryPieChart.destroy();
  }

  categoryPieChart = new Chart(canvas, {
    type: "doughnut",

    data: {
      labels: sortedCategories.map((category) => {
        return `${category.icon} ${category.name}`;
      }),

      datasets: [{
        data: sortedCategories.map((category) => category.total)
      }]
    },

    options: {
      responsive: true,
      maintainAspectRatio: false,

      plugins: {
        legend: {
          position: "bottom",

          labels: {
            usePointStyle: true,
            padding: 14,
            font: {
              size: 11
            }
          }
        },

        tooltip: {
          callbacks: {
            label: function(context) {
              const value = Number(context.raw);

              const percentage = totalSpending
                ? ((value / totalSpending) * 100).toFixed(1)
                : 0;

              return ` ${formatCurrency(value)} (${percentage}%)`;
            }
          }
        }
      },

      cutout: "62%"
    }
  });
}

let dailySpendingChart = null;

function renderDailySpendingChart(reportExpenses) {
  const canvas = document.getElementById("dailySpendingChart");

  if (!canvas) {
    return;
  }

  if (dailySpendingChart) {
    dailySpendingChart.destroy();
  }

  const dailyTotals = {};

  reportExpenses.forEach((expense) => {
    const date = expense.expense_date;

    if (!dailyTotals[date]) {
      dailyTotals[date] = 0;
    }

    dailyTotals[date] += Number(expense.amount);
  });

  const dates = Object.keys(dailyTotals).sort();

  const labels = dates.map((date) => {
    const parts = date.split("-");
    return `${parts[2]}/${parts[1]}`;
  });

  const values = dates.map((date) => dailyTotals[date]);

  dailySpendingChart = new Chart(canvas, {
    type: "line",

    data: {
      labels: labels,

      datasets: [{
        label: "Daily Spending",
        data: values,
        tension: 0.35,
        fill: true
      }]
    },

    options: {
      responsive: true,
      maintainAspectRatio: false,

      scales: {
        y: {
          beginAtZero: true,

          ticks: {
            callback: function(value) {
              return formatShortCurrency(value);
            }
          }
        },

        x: {
          ticks: {
            maxRotation: 0,
            autoSkip: true,
            maxTicksLimit: 7
          }
        }
      },

      plugins: {
        legend: {
          display: false
        },

        tooltip: {
          callbacks: {
            label: function(context) {
              return ` ${formatCurrency(context.raw)}`;
            }
          }
        }
      }
    }
  });
}

function renderPersonReport(reportExpenses) {
  const container = document.getElementById("personReportList");
  const differenceContainer = document.getElementById("personDifference");

  if (!reportExpenses.length) {
    container.innerHTML = `
      <div class="empty-state">No expenses this month.</div>
    `;

    differenceContainer.textContent = "";
    return;
  }

  const personTotals = {};

  reportExpenses.forEach((expense) => {
    const userId = expense.user_id;

    if (!personTotals[userId]) {
      personTotals[userId] = {
        name: expense.users?.name || "Unknown",
        total: 0
      };
    }

    personTotals[userId].total += Number(expense.amount);
  });

  const people = Object.values(personTotals);

  const totalSpending = people.reduce(
    (sum, person) => sum + person.total,
    0
  );

  people.sort((a, b) => b.total - a.total);

  container.innerHTML = people.map((person) => {
    const percentage = totalSpending
      ? Math.round((person.total / totalSpending) * 100)
      : 0;

    return `
      <div class="person-report-row">

        <div class="person-report-top">
          <span class="person-name">
            👤 ${person.name}
          </span>

          <strong>
            ${formatCurrency(person.total)}
          </strong>
        </div>

        <div class="person-progress">
          <div
            class="person-progress-fill"
            style="width: ${percentage}%"
          ></div>
        </div>

        <div class="person-percentage">
          ${percentage}% of household spending
        </div>

      </div>
    `;
  }).join("");

  if (people.length >= 2) {
    const difference = people[0].total - people[1].total;

    if (difference > 0) {
      differenceContainer.textContent =
        `${people[0].name} spent ${formatCurrency(difference)} more this month.`;
    } else if (difference === 0) {
      differenceContainer.textContent =
        "Both spent the same amount this month.";
    }
  } else {
    differenceContainer.textContent = "";
  }
}

// =========================
// Expenses
// =========================

async function loadExpenses() {
  showLoading();

  try {
    const date = formatDateForDatabase(selectedDate);

    const {
      data,
      error
    } = await supabaseClient
      .from("expenses")
      .select(`
        id,
        amount,
        note,
        expense_date,
        category_id,
        user_id,
        users (
          name
        ),
        categories (
          name,
          icon
        )
      `)
      .eq("expense_date", date)
      .order("created_at", {
        ascending: false
      });

    if (error) {
      throw error;
    }

    let filteredExpenses = data || [];
console.log("CURRENT VIEW:", dataViewMode);
console.log("CURRENT USER:", currentUserId);
console.log("EXPENSE USERS:", data.map(expense => expense.user_id));

    if (dataViewMode === "me") {
      filteredExpenses = filteredExpenses.filter(
        expense => expense.user_id === currentUserId
      );

    } else if (dataViewMode === "other") {
      filteredExpenses = filteredExpenses.filter(
        expense => expense.user_id !== currentUserId
      );
    }

    expenses = filteredExpenses;

    renderExpenses();

  } catch (error) {
    console.error("Error loading expenses:", error);

  } finally {
    hideLoading();
  }
}


function renderExpenses() {

    expenseList.innerHTML = "";

    expenseCount.textContent = expenses.length;

    if (expenses.length === 0) {

        expenseList.innerHTML = `
            <div class="empty-state">
                No expenses for this day.
            </div>
        `;

        dayTotal.textContent = "₹0";

        return;
    }

    let total = 0;

    expenses.forEach(expense => {

        total += Number(expense.amount);

        const row = document.createElement("div");

        row.className = "expense-row";

        const category = expense.categories || {};
        const user = expense.users || {};

        row.innerHTML = `
            <div class="expense-icon">
                ${escapeHtml(category.icon || "📦")}
            </div>

            <div class="expense-details">
                <strong>
                    ${escapeHtml(category.name || "Other")}
                </strong>

                <span>
                    ${escapeHtml(expense.note || "")}
                </span>

                <small>
                    ${escapeHtml(user.name || "")}
                </small>
            </div>

            <div class="expense-amount">
                ${formatCurrency(expense.amount)}
            </div>

            <div class="expense-actions">
                <button
                    class="expense-edit-button"
                    data-expense-id="${expense.id}"
                    type="button"
                >
                    ✏️
                </button>

                <button
                    class="expense-delete-button"
                    data-expense-id="${expense.id}"
                    type="button"
                >
                    🗑️
                </button>
            </div>
        `;

        expenseList.appendChild(row);
    });

    dayTotal.textContent = formatCurrency(total);


    // Edit buttons

    document
        .querySelectorAll(".expense-edit-button")
        .forEach(button => {

            button.addEventListener("click", () => {

                const expenseId =
                    button.dataset.expenseId;

                editExpense(expenseId);
            });
        });


    // Delete buttons

    document
        .querySelectorAll(".expense-delete-button")
        .forEach(button => {

            button.addEventListener("click", () => {

                const expenseId =
                    button.dataset.expenseId;

                deleteExpense(expenseId);
            });
        });
}
// =========================
// Add Expense
// =========================

function openExpenseModal() {

    delete expenseForm.dataset.editingId;

    expenseModal.classList.remove("hidden");

    expenseForm.reset();

    expenseDateInput.value =
        formatDateForDatabase(selectedDate);

    expenseError.textContent = "";

    document
        .querySelectorAll(".category-button")
        .forEach(item =>
            item.classList.remove("selected")
        );

    amountInput.focus();
}


function closeExpenseModal() {

    expenseModal.classList.add("hidden");
}


async function saveExpense(event) {

    event.preventDefault();

    expenseError.textContent = "";

    const amount =
        Number(amountInput.value);

    const selectedCategory =
        document.querySelector(
            ".category-button.selected"
        );

    if (!amount || amount <= 0) {

        expenseError.textContent =
            "Please enter a valid amount.";

        return;
    }

    if (!selectedCategory) {

        expenseError.textContent =
            "Please select a category.";

        return;
    }

    const categoryId =
        selectedCategory.dataset.categoryId;

    const date =
        expenseDateInput.value;

    const note =
        noteInput.value.trim();

    const editingId =
        expenseForm.dataset.editingId;


    // -------------------------
    // Edit existing expense
    // -------------------------

    if (editingId) {

        await updateExpense(editingId);

        return;
    }


    // -------------------------
    // Add new expense
    // -------------------------

    const {
        error
    } = await supabaseClient
        .from("expenses")
        .insert({
            user_id: currentUserId,
            category_id: categoryId,
            expense_date: date,
            amount: amount,
            note: note || null
        });

    if (error) {

        console.error(error);

        expenseError.textContent =
            "Could not save expense.";

        return;
    }

    closeExpenseModal();

    selectedDate =
        new Date(`${date}T00:00:00`);

    updateDateDisplay();

    await loadExpenses();
}


// =========================
// App Startup
// =========================

async function startApp() {

    registrationScreen.classList.add("hidden");
    app.classList.remove("hidden");

    updateDateDisplay();

await loadCategories();
await loadSavedTheme();
await loadSavedDataView();
await setupDataViewOptions();
await loadExpenses();
}


async function init() {

    try {

        await ensureAuthenticated();

        const registered =
            await checkRegistration();

        if (registered) {
            await startApp();
        }

    } catch (error) {

        console.error(error);

        document.body.innerHTML = `
            <div style="
                padding:30px;
                font-family:Arial,sans-serif;
            ">
                <h2>Something went wrong</h2>
                <p>Please check the browser console.</p>
                <pre>${escapeHtml(error.message || String(error))}</pre>
            </div>
        `;
    }
}

// Calendar month navigation

previousMonth.addEventListener(
    "click",
    async () => {

        calendarDate.setMonth(
            calendarDate.getMonth() - 1
        );

        await loadCalendarExpenses();

        renderCalendar();
    }
);


nextMonth.addEventListener(
    "click",
    async () => {

        calendarDate.setMonth(
            calendarDate.getMonth() + 1
        );

        await loadCalendarExpenses();

        renderCalendar();
    }
);


calendarTodayButton.addEventListener(
    "click",
    async () => {

        selectedDate = new Date();

        calendarDate = new Date();

        updateDateDisplay();

        showTodayScreen();

        await loadExpenses();
    }
);

// =========================
// Events
// =========================

previousDay.addEventListener("click", async () => {

    selectedDate.setDate(
        selectedDate.getDate() - 1
    );

    updateDateDisplay();

    await loadExpenses();
});


nextDay.addEventListener("click", async () => {

    selectedDate.setDate(
        selectedDate.getDate() + 1
    );

    updateDateDisplay();

    await loadExpenses();
});


addExpenseButton.addEventListener(
    "click",
    openExpenseModal
);


closeModalButton.addEventListener(
    "click",
    closeExpenseModal
);


expenseForm.addEventListener(
    "submit",
    saveExpense
);


registerButton.addEventListener(
    "click",
    registerDevice
);

document.querySelectorAll(".nav-item").forEach((nav) => {
  nav.addEventListener("click", () => {
    const tab = nav.dataset.tab;

    document.querySelectorAll(".nav-item").forEach((item) => {
      item.classList.remove("active");
    });

    nav.classList.add("active");

    if (tab === "today") {
      showTodayScreen();
loadExpenses();

    } else if (tab === "calendar") {
      showCalendarScreen();

    } else if (tab === "reports") {
      showReportsScreen();
      loadReports();

    } else if (tab === "settings") {
      showSettingsScreen();
    }
  });
});

expenseModal.addEventListener(
  "click",
  (event) => {
    if (event.target === expenseModal) {
      closeExpenseModal();
    }
  }
);


// =========================
// Helpers
// =========================
function applyTheme(theme) {
  document.body.classList.remove("dark-theme");

  if (theme === "dark") {
    document.body.classList.add("dark-theme");

  } else if (theme === "system") {
    if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
      document.body.classList.add("dark-theme");
    }
  }
}

const themeSelect = document.getElementById("themeSelect");

if (themeSelect) {
  themeSelect.addEventListener("change", () => {
    const selectedTheme = themeSelect.value;

    localStorage.setItem(
      "expenseTrackerTheme",
      selectedTheme
    );

    applyTheme(selectedTheme);
  });
}

const dataViewSelect = document.getElementById("dataViewSelect");

if (dataViewSelect) {
  dataViewSelect.addEventListener("change", async () => {
    const selectedView = dataViewSelect.value;

    console.log("VIEW SELECTED:", selectedView);

    saveDataView(selectedView);

    const calendarScreen = document.getElementById("calendarScreen");
    const reportsScreen = document.getElementById("reportsScreen");

    if (!document.getElementById("todayScreen").classList.contains("hidden")) {
      await loadExpenses();
    }

    if (calendarScreen && !calendarScreen.classList.contains("hidden")) {
      await loadCalendarExpenses();
      renderCalendar();
    }

    if (reportsScreen && !reportsScreen.classList.contains("hidden")) {
      await loadReports();
    }
  });
}

function loadSavedTheme() {
  const savedTheme = localStorage.getItem("expenseTrackerTheme") || "system";

  const themeSelect = document.getElementById("themeSelect");

  if (themeSelect) {
    themeSelect.value = savedTheme;
  }

  applyTheme(savedTheme);
}

async function setupDataViewOptions() {
    const select = document.getElementById("dataViewSelect");

    if (!select || !currentUserId) {
        return;
    }

    const { data, error } = await supabaseClient
        .from("users")
        .select("id, name")
        .order("created_at");

    if (error) {
        console.error("Error loading household users:", error);
        return;
    }

    const currentUser = data?.find(
        user => user.id === currentUserId
    );

    const otherUser = data?.find(
        user => user.id !== currentUserId
    );

    if (currentUser) {
        select.querySelector('option[value="me"]').textContent =
            currentUser.name;
    }

    if (otherUser) {
        select.querySelector('option[value="other"]').textContent =
            otherUser.name;
    }

    select.value = dataViewMode;
}

function loadSavedDataView() {
  const savedView = localStorage.getItem("expenseTrackerDataView");

  dataViewMode = savedView || "both";

  const select = document.getElementById("dataViewSelect");

  if (select) {
    select.value = dataViewMode;
  }
}

function saveDataView(mode) {
  dataViewMode = mode;

  localStorage.setItem(
    "expenseTrackerDataView",
    mode
  );

  console.log("DATA VIEW CHANGED:", dataViewMode);
}

function showSettingsScreen() {
  document.querySelectorAll(".app-screen").forEach((screen) => {
    screen.classList.add("hidden");
  });

  document.getElementById("settingsScreen").classList.remove("hidden");
}

function formatDateForSupabase(date) {
  return date.toISOString().split("T")[0];
}

function formatCurrency(value) {

    return new Intl.NumberFormat(
        "en-IN",
        {
            style: "currency",
            currency: "INR",
            maximumFractionDigits: 2
        }
    ).format(Number(value));
}

function formatShortCurrency(value) {

    const amount = Number(value);

    if (amount >= 100000) {
        return `₹${(amount / 100000).toFixed(1)}L`;
    }

    if (amount >= 1000) {
        return `₹${(amount / 1000).toFixed(1)}k`;
    }

    return `₹${Math.round(amount)}`;
}

function escapeHtml(value) {

    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}


// =========================
// Edit Expense
// =========================

async function editExpense(expenseId) {

    const expense =
        expenses.find(item => item.id === expenseId);

    if (!expense) {
        return;
    }

    amountInput.value = expense.amount;

    noteInput.value = expense.note || "";

    expenseDateInput.value =
        expense.expense_date;

    document
        .querySelectorAll(".category-button")
        .forEach(button => {

            button.classList.remove("selected");

            if (
                button.dataset.categoryId ===
                expense.category_id
            ) {
                button.classList.add("selected");
            }
        });

    expenseError.textContent = "";

    expenseModal.classList.remove("hidden");

    expenseForm.dataset.editingId =
        expenseId;

    amountInput.focus();
}


// =========================
// Update Expense
// =========================

async function updateExpense(expenseId) {

    const amount =
        Number(amountInput.value);

    const selectedCategory =
        document.querySelector(
            ".category-button.selected"
        );

    if (!amount || amount <= 0) {

        expenseError.textContent =
            "Please enter a valid amount.";

        return;
    }

    if (!selectedCategory) {

        expenseError.textContent =
            "Please select a category.";

        return;
    }

    const categoryId =
        selectedCategory.dataset.categoryId;

    const date =
        expenseDateInput.value;

    const note =
        noteInput.value.trim();

    const {
        error
    } = await supabaseClient
        .from("expenses")
        .update({
            category_id: categoryId,
            expense_date: date,
            amount: amount,
            note: note || null,
            updated_at: new Date().toISOString()
        })
        .eq("id", expenseId)
        .eq("user_id", currentUserId);

    if (error) {

        console.error(error);

        expenseError.textContent =
            "Could not update expense.";

        return;
    }

    delete expenseForm.dataset.editingId;

    closeExpenseModal();

    selectedDate =
        new Date(`${date}T00:00:00`);

    updateDateDisplay();

    await loadExpenses();
}


// =========================
// Delete Expense
// =========================

async function deleteExpense(expenseId) {

    const expense =
        expenses.find(item => item.id === expenseId);

    if (!expense) {
        return;
    }

    const confirmed =
        confirm(
            `Delete ${formatCurrency(expense.amount)} expense?`
        );

    if (!confirmed) {
        return;
    }

    const {
        error
    } = await supabaseClient
        .from("expenses")
        .delete()
        .eq("id", expenseId)
        .eq("user_id", currentUserId);

    if (error) {

        console.error(error);

        alert("Could not delete the expense.");

        return;
    }

    await loadExpenses();
}
// =========================
// Start
// =========================

init();

if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
        navigator.serviceWorker.register("./sw.js")
            .then(registration => {
                console.log(
                    "Service worker registered:",
                    registration.scope
                );
            })
            .catch(error => {
                console.error(
                    "Service worker registration failed:",
                    error
                );
            });
    });
}

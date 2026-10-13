
/* =========================================================
   SAVINGS FEATURE
   Uses the existing supabaseClient from app.js.
   Does not read or modify expense records.
   ========================================================= */

const savingsState = {
    topics: [],
    plans: [],
    transactions: [],
    selectedTopicId: null,
    period: "monthly",
    month: new Date().toISOString().slice(0, 7),
    year: String(new Date().getFullYear())
};

const savingsINR = new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2
});

function savingsMoney(value) {
    return savingsINR.format(Number(value) || 0);
}

function savingsEscape(value) {
    return String(value ?? "").replace(/[&<>"']/g, char => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    })[char]);
}

function savingsMonthStart(month) {
    return `${month}-01`;
}

function savingsPeriodEnd() {
    if (savingsState.period === "monthly") {
        const [year, month] = savingsState.month.split("-").map(Number);
        return new Date(year, month, 0).toISOString().slice(0, 10);
    }

    return `${savingsState.year}-12-31`;
}

function savingsPeriodStart() {
    return savingsState.period === "monthly"
        ? `${savingsState.month}-01`
        : `${savingsState.year}-01-01`;
}

function savingsPeriodLabel() {
    if (savingsState.period === "monthly") {
        const [year, month] = savingsState.month.split("-").map(Number);
        return new Date(year, month - 1, 1).toLocaleDateString("en-IN", {
            month: "long",
            year: "numeric"
        });
    }

    return savingsState.year;
}

function savingsTransactionsForTopic(topicId) {
    const end = savingsPeriodEnd();

    return savingsState.transactions.filter(transaction =>
        transaction.topic_id === topicId &&
        transaction.transaction_date <= end
    );
}

function savingsPeriodTransactions(topicId) {
    const start = savingsPeriodStart();
    const end = savingsPeriodEnd();

    return savingsState.transactions.filter(transaction =>
        transaction.topic_id === topicId &&
        transaction.transaction_date >= start &&
        transaction.transaction_date <= end
    );
}

function savingsTotals(transactions) {
    let credits = 0;
    let debits = 0;

    transactions.forEach(transaction => {
        const amount = Number(transaction.amount);

        if (transaction.transaction_type === "credit") {
            credits += amount;
        } else {
            debits += amount;
        }
    });

    return {
        credits,
        debits,
        balance: credits - debits
    };
}

function savingsPlanForTopic(topicId) {
    const start = savingsPeriodStart();
    const end = savingsPeriodEnd();

    return savingsState.plans
        .filter(plan =>
            plan.topic_id === topicId &&
            plan.plan_month >= start &&
            plan.plan_month <= end
        )
        .reduce((sum, plan) => sum + Number(plan.planned_amount), 0);
}


function showSavingsScreen() {
    const screen = document.getElementById("savingsScreen");

    if (!screen) {
        console.error(
            'Savings screen not found. Check that index.html contains id="savingsScreen".'
        );
        return;
    }

    document.querySelectorAll(".app-screen").forEach(item => {
        item.classList.add("hidden");
    });

    screen.classList.remove("hidden");

    // Hide the expense-specific add button while Savings is open.
    if (typeof addExpenseButton !== "undefined" && addExpenseButton) {
        addExpenseButton.classList.add("hidden");
    }

    loadSavingsData().catch(error => {
        console.error("Failed to load savings data:", error);

        const topicList = document.getElementById("savingsTopicList");
        if (topicList) {
            topicList.innerHTML = `
                <div class="empty-state">
                    Couldn't load savings data. Please check your connection
                    and Supabase permissions, then try again.
                </div>
            `;
        }
    });
}


async function loadSavingsData() {
    const [topicsResult, plansResult, transactionsResult] =
        await Promise.all([
            supabaseClient
                .from("savings_topics")
                .select("*")
                .order("name"),

            supabaseClient
                .from("savings_month_plans")
                .select("*")
                .order("plan_month"),

            supabaseClient
                .from("savings_transactions")
                .select("*")
                .order("transaction_date", { ascending: false })
        ]);

    if (topicsResult.error) throw topicsResult.error;
    if (plansResult.error) throw plansResult.error;
    if (transactionsResult.error) throw transactionsResult.error;

    savingsState.topics = topicsResult.data || [];
    savingsState.plans = plansResult.data || [];
    savingsState.transactions = transactionsResult.data || [];

    renderSavings();
}

function renderSavings() {
    const topicList = document.getElementById("savingsTopicList");
    const summary = document.getElementById("savingsSummary");
    const detail = document.getElementById("savingsDetail");

    if (!topicList || !summary || !detail) return;

    const visibleTopics = savingsState.topics.filter(topic => topic.is_active);

    let totalPlan = 0;
    let totalCredits = 0;
    let totalDebits = 0;
    let totalBalance = 0;

    visibleTopics.forEach(topic => {
        totalPlan += savingsPlanForTopic(topic.id);
        totalCredits += savingsTotals(savingsPeriodTransactions(topic.id)).credits;
        totalDebits += savingsTotals(savingsPeriodTransactions(topic.id)).debits;
        totalBalance += savingsTotals(savingsTransactionsForTopic(topic.id)).balance;
    });

    summary.innerHTML = `
        <div class="savings-summary-card">
            <span>Planned</span>
            <strong>${savingsMoney(totalPlan)}</strong>
        </div>
        <div class="savings-summary-card">
            <span>Credits this period</span>
            <strong>${savingsMoney(totalCredits)}</strong>
        </div>
        <div class="savings-summary-card">
            <span>Debits this period</span>
            <strong>${savingsMoney(totalDebits)}</strong>
        </div>
        <div class="savings-summary-card">
            <span>Balance at period end</span>
            <strong>${savingsMoney(totalBalance)}</strong>
        </div>
    `;

    topicList.innerHTML = visibleTopics.length
        ? visibleTopics.map(topic => {
            const plan = savingsPlanForTopic(topic.id);
            const periodTotals = savingsTotals(savingsPeriodTransactions(topic.id));
            const balance = savingsTotals(savingsTransactionsForTopic(topic.id)).balance;
            const overspent = periodTotals.debits > plan;

            return `
                <button class="savings-topic-card"
                    type="button"
                    data-savings-topic="${savingsEscape(topic.id)}">
                    <span class="savings-topic-title">
                        ${savingsEscape(topic.name)}
                    </span>
                    <span class="savings-topic-description">
                        ${savingsEscape(topic.description || "")}
                    </span>
                    <span class="savings-topic-metrics">
                        <span>Plan<strong>${savingsMoney(plan)}</strong></span>
                        <span>Credits<strong>${savingsMoney(periodTotals.credits)}</strong></span>
                        <span>Debits<strong>${savingsMoney(periodTotals.debits)}</strong></span>
                        <span>Balance<strong>${savingsMoney(balance)}</strong></span>
                    </span>
                    ${overspent && plan > 0
                        ? `<span class="savings-overspent">Debits exceed this period's plan</span>`
                        : ""}
                    <span class="savings-open-hint">View transactions →</span>
                </button>
            `;
        }).join("")
        : `<div class="empty-state">No savings topics yet. Add your first topic.</div>`;

    topicList.querySelectorAll("[data-savings-topic]").forEach(button => {
        button.addEventListener("click", () => {
            savingsState.selectedTopicId = button.dataset.savingsTopic;
            renderSavingsDetail();
        });
    });

    renderSavingsDetail();
}

function renderSavingsDetail() {
    const detail = document.getElementById("savingsDetail");
    const detailContent = document.getElementById("savingsTopicDetail");
    const transactionList = document.getElementById("savingsTransactionList");
    const topicList = document.getElementById("savingsTopicList");
    const heading = document.querySelector(".savings-section-heading");

    const topic = savingsState.topics.find(item =>
        item.id === savingsState.selectedTopicId
    );

    if (!topic) {
        detail.classList.add("hidden");
        topicList.classList.remove("hidden");
        if (heading) heading.classList.remove("hidden");
        return;
    }

    detail.classList.remove("hidden");
    topicList.classList.add("hidden");
    if (heading) heading.classList.add("hidden");

    const plan = savingsPlanForTopic(topic.id);
    const periodTotals = savingsTotals(savingsPeriodTransactions(topic.id));
    const balance = savingsTotals(savingsTransactionsForTopic(topic.id)).balance;
    const periodTransactions = savingsPeriodTransactions(topic.id)
        .sort((a, b) =>
            b.transaction_date.localeCompare(a.transaction_date) ||
            b.created_at.localeCompare(a.created_at)
        );

    detailContent.innerHTML = `
        <h3>${savingsEscape(topic.name)}</h3>
        <p>${savingsEscape(topic.description || "")}</p>

        <div class="savings-detail-metrics">
            <div><span>Plan for ${savingsEscape(savingsPeriodLabel())}</span>
                <strong>${savingsMoney(plan)}</strong></div>
            <div><span>Credits this period</span>
                <strong>${savingsMoney(periodTotals.credits)}</strong></div>
            <div><span>Debits this period</span>
                <strong>${savingsMoney(periodTotals.debits)}</strong></div>
            <div><span>Balance carried forward</span>
                <strong>${savingsMoney(balance)}</strong></div>
        </div>

        <div class="savings-actions">
            <button type="button" id="editSavingsTopicButton">Edit topic</button>
            <button type="button" id="setSavingsPlanButton">Set plan</button>
            <button type="button" id="addSavingsCreditButton">+ Credit</button>
            <button type="button" id="addSavingsDebitButton">− Debit</button>
        </div>
    `;

    transactionList.innerHTML = `
        <h4>Transactions for ${savingsEscape(savingsPeriodLabel())}</h4>
        ${periodTransactions.length ? periodTransactions.map(transaction => `
            <div class="savings-transaction">
                <div class="savings-transaction-main">
                    <strong>${savingsEscape(transaction.description ||
                        (transaction.transaction_type === "credit" ? "Credit" : "Debit"))}</strong>
                    <span>${savingsEscape(transaction.transaction_date)}</span>
                </div>
                <strong class="${transaction.transaction_type === "credit"
                    ? "savings-credit" : "savings-debit"}">
                    ${transaction.transaction_type === "credit" ? "+" : "−"}${savingsMoney(transaction.amount)}
                </strong>
                <div class="savings-transaction-actions">
                    <button type="button" data-edit-transaction="${savingsEscape(transaction.id)}">Edit</button>
                    <button type="button" data-delete-transaction="${savingsEscape(transaction.id)}">Delete</button>
                </div>
            </div>
        `).join("") : `<div class="empty-state">No transactions in this period.</div>`}
    `;

    document.getElementById("editSavingsTopicButton").onclick =
        () => editSavingsTopic(topic);

    document.getElementById("setSavingsPlanButton").onclick =
        () => setSavingsPlan(topic);

    document.getElementById("addSavingsCreditButton").onclick =
        () => addSavingsTransaction(topic, "credit");

    document.getElementById("addSavingsDebitButton").onclick =
        () => addSavingsTransaction(topic, "debit");

    transactionList.querySelectorAll("[data-edit-transaction]").forEach(button => {
        button.addEventListener("click", () => {
            const transaction = savingsState.transactions.find(item =>
                item.id === button.dataset.editTransaction
            );
            if (transaction) editSavingsTransaction(transaction);
        });
    });

    transactionList.querySelectorAll("[data-delete-transaction]").forEach(button => {
        button.addEventListener("click", () =>
            deleteSavingsTransaction(button.dataset.deleteTransaction)
        );
    });
}

/* =========================================================
   SAVINGS FORM MODAL
   Reusable in-app form; no browser prompt/alert popups.
   ========================================================= */

function savingsOpenForm({ title, fields, initial = {}, saveLabel = "Save" }) {
    return new Promise(resolve => {
        const previous = document.getElementById("savingsFormModal");
        if (previous) previous.remove();

        const modal = document.createElement("div");
        modal.id = "savingsFormModal";
        modal.className = "savings-modal-overlay";

        const fieldHTML = fields.map(field => {
            const value = initial[field.name] ?? field.value ?? "";
            const safeValue = savingsEscape(value);

            let control;

            if (field.type === "select") {
                control = `
                    <select name="${savingsEscape(field.name)}"
                        ${field.required === false ? "" : "required"}>
                        ${(field.options || []).map(option => `
                            <option value="${savingsEscape(option.value)}"
                                ${String(option.value) === String(value) ? "selected" : ""}>
                                ${savingsEscape(option.label)}
                            </option>
                        `).join("")}
                    </select>`;
            } else if (field.type === "textarea") {
                control = `
                    <textarea name="${savingsEscape(field.name)}"
                        rows="3"
                        ${field.required === false ? "" : "required"}>${safeValue}</textarea>`;
            } else {
                control = `
                    <input
                        name="${savingsEscape(field.name)}"
                        type="${savingsEscape(field.type || "text")}"
                        value="${safeValue}"
                        ${field.min !== undefined ? `min="${field.min}"` : ""}
                        ${field.step !== undefined ? `step="${field.step}"` : ""}
                        ${field.maxlength ? `maxlength="${field.maxlength}"` : ""}
                        ${field.required === false ? "" : "required"}
                    >`;
            }

            return `
                <label class="savings-form-field">
                    <span>${savingsEscape(field.label)}</span>
                    ${control}
                    ${field.help ? `<small>${savingsEscape(field.help)}</small>` : ""}
                </label>`;
        }).join("");

        modal.innerHTML = `
            <div class="savings-modal-card" role="dialog"
                aria-modal="true" aria-labelledby="savingsModalTitle">
                <div class="savings-modal-header">
                    <h3 id="savingsModalTitle">${savingsEscape(title)}</h3>
                    <button type="button" class="savings-modal-close"
                        aria-label="Close">×</button>
                </div>
                <form class="savings-modal-form">
                    <div class="savings-modal-fields">${fieldHTML}</div>
                    <div class="savings-modal-actions">
                        <button type="button" class="savings-cancel-button">
                            Cancel
                        </button>
                        <button type="submit" class="savings-save-button">
                            ${savingsEscape(saveLabel)}
                        </button>
                    </div>
                    <p class="savings-form-error hidden" role="alert"></p>
                </form>
            </div>`;

        document.body.appendChild(modal);

        const form = modal.querySelector("form");
        const errorBox = modal.querySelector(".savings-form-error");
        let finished = false;

        function close(result) {
            if (finished) return;
            finished = true;
            modal.remove();
            resolve(result);
        }

        modal.querySelector(".savings-modal-close")
            .addEventListener("click", () => close(null));

        modal.querySelector(".savings-cancel-button")
            .addEventListener("click", () => close(null));

        modal.addEventListener("click", event => {
            if (event.target === modal) close(null);
        });

        form.addEventListener("submit", async event => {
            event.preventDefault();

            const values = Object.fromEntries(new FormData(form).entries());

            for (const field of fields) {
                const value = String(values[field.name] ?? "").trim();

                if (field.required !== false && !value) {
                    errorBox.textContent = `${field.label} is required.`;
                    errorBox.classList.remove("hidden");
                    return;
                }

                if (field.type === "number" && value !== "") {
                    const number = Number(value);

                    if (!Number.isFinite(number) ||
                        (field.min !== undefined && number < field.min)) {
                        errorBox.textContent =
                            `${field.label} must be at least ${field.min ?? 0}.`;
                        errorBox.classList.remove("hidden");
                        return;
                    }
                }
            }

            close(values);
        });

        const firstInput = form.querySelector("input, select, textarea");
        if (firstInput) firstInput.focus();
    });
}

/* A local date helper avoids UTC date shifts on some devices. */
function savingsTodayLocal() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

function savingsValidDate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;

    const date = new Date(`${value}T00:00:00`);
    return !Number.isNaN(date.getTime()) &&
        date.getFullYear() === Number(value.slice(0, 4)) &&
        date.getMonth() + 1 === Number(value.slice(5, 7)) &&
        date.getDate() === Number(value.slice(8, 10));
}

async function savingsShowSaveError(action, error) {
    console.error(`Savings: ${action} failed`, error);
    const message = error?.message || "Please try again.";

    await savingsOpenForm({
        title: "Couldn't save changes",
        fields: [{
            name: "message",
            label: "Details",
            type: "textarea",
            required: false
        }],
        initial: { message },
        saveLabel: "Close"
    });
}


async function addSavingsTopic() {
    const defaultMonth = savingsState.period === "monthly"
        ? savingsState.month
        : `${savingsState.year}-01`;

    const values = await savingsOpenForm({
        title: "Add savings topic",
        fields: [
            { name: "name", label: "Topic name", maxlength: 100 },
            {
                name: "description",
                label: "Description (optional)",
                type: "textarea",
                required: false
            },
            {
                name: "plan_month",
                label: "Plan month",
                type: "month",
                value: defaultMonth
            },
            {
                name: "planned_amount",
                label: "Planned amount (₹)",
                type: "number",
                min: 0,
                step: "0.01",
                value: "0"
            }
        ],
        saveLabel: "Save topic"
    });

    if (!values) return;

    const name = values.name.trim();
    const description = (values.description || "").trim();
    const planMonth = values.plan_month;
    const plannedAmount = Number(values.planned_amount);

    if (!name || !/^\d{4}-(0[1-9]|1[0-2])$/.test(planMonth) ||
        !Number.isFinite(plannedAmount) || plannedAmount < 0) {
        return savingsShowSaveError("validation", {
            message: "Check the topic name, plan month and planned amount."
        });
    }

    const { data: topic, error: topicError } = await supabaseClient
        .from("savings_topics")
        .insert({ name, description })
        .select()
        .single();

    if (topicError) {
        return savingsShowSaveError("creating the topic", topicError);
    }

    const { error: planError } = await supabaseClient
        .from("savings_month_plans")
        .upsert({
            topic_id: topic.id,
            plan_month: `${planMonth}-01`,
            planned_amount: plannedAmount,
            updated_at: new Date().toISOString()
        }, { onConflict: "topic_id,plan_month" });

    if (planError) {
        savingsState.selectedTopicId = topic.id;
        await loadSavingsData().catch(console.error);
        return savingsShowSaveError(
            "saving the monthly plan; the topic was created",
            planError
        );
    }

    savingsState.selectedTopicId = topic.id;
    await loadSavingsData();
}


async function editSavingsTopic(topic) {
    const currentMonth = savingsState.period === "monthly"
        ? savingsState.month
        : `${savingsState.year}-01`;

    const existingPlan = savingsState.plans.find(plan =>
        plan.topic_id === topic.id &&
        plan.plan_month === `${currentMonth}-01`
    );

    const values = await savingsOpenForm({
        title: "Edit savings topic",
        fields: [
            { name: "name", label: "Topic name", maxlength: 100 },
            {
                name: "description",
                label: "Description (optional)",
                type: "textarea",
                required: false
            },
            {
                name: "plan_month",
                label: "Plan month",
                type: "month",
                value: currentMonth
            },
            {
                name: "planned_amount",
                label: "Planned amount (₹)",
                type: "number",
                min: 0,
                step: "0.01",
                value: existingPlan?.planned_amount ?? 0
            }
        ],
        initial: {
            name: topic.name,
            description: topic.description || "",
            plan_month: currentMonth,
            planned_amount: existingPlan?.planned_amount ?? 0
        },
        saveLabel: "Save changes"
    });

    if (!values) return;

    const name = values.name.trim();
    const planMonth = values.plan_month;
    const plannedAmount = Number(values.planned_amount);

    if (!name || !/^\d{4}-(0[1-9]|1[0-2])$/.test(planMonth) ||
        !Number.isFinite(plannedAmount) || plannedAmount < 0) {
        return savingsShowSaveError("validation", {
            message: "Check the topic name, month and planned amount."
        });
    }

    const { error: topicError } = await supabaseClient
        .from("savings_topics")
        .update({
            name,
            description: (values.description || "").trim(),
            updated_at: new Date().toISOString()
        })
        .eq("id", topic.id);

    if (topicError) {
        return savingsShowSaveError("updating the topic", topicError);
    }

    const { error: planError } = await supabaseClient
        .from("savings_month_plans")
        .upsert({
            topic_id: topic.id,
            plan_month: `${planMonth}-01`,
            planned_amount: plannedAmount,
            updated_at: new Date().toISOString()
        }, { onConflict: "topic_id,plan_month" });

    if (planError) {
        await loadSavingsData().catch(console.error);
        return savingsShowSaveError("saving the monthly plan", planError);
    }

    savingsState.selectedTopicId = topic.id;
    await loadSavingsData();
}

async function setSavingsPlan(topic) {
    const defaultMonth = savingsState.period === "monthly"
        ? savingsState.month
        : `${savingsState.year}-01`;

    const existing = savingsState.plans.find(plan =>
        plan.topic_id === topic.id &&
        plan.plan_month === `${defaultMonth}-01`
    );

    const values = await savingsOpenForm({
        title: "Set monthly plan",
        fields: [
            {
                name: "plan_month",
                label: "Plan month",
                type: "month",
                value: defaultMonth
            },
            {
                name: "planned_amount",
                label: "Planned amount (₹)",
                type: "number",
                min: 0,
                step: "0.01",
                value: existing?.planned_amount ?? 0
            }
        ],
        initial: {
            plan_month: defaultMonth,
            planned_amount: existing?.planned_amount ?? 0
        },
        saveLabel: "Save plan"
    });

    if (!values) return;

    const month = values.plan_month;
    const amount = Number(values.planned_amount);

    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month) ||
        !Number.isFinite(amount) || amount < 0) {
        return savingsShowSaveError("validation", {
            message: "Check the plan month and amount."
        });
    }

    const { error } = await supabaseClient
        .from("savings_month_plans")
        .upsert({
            topic_id: topic.id,
            plan_month: `${month}-01`,
            planned_amount: amount,
            updated_at: new Date().toISOString()
        }, { onConflict: "topic_id,plan_month" });

    if (error) {
        return savingsShowSaveError("saving the monthly plan", error);
    }

    await loadSavingsData();
}


async function addSavingsTransaction(topic, type) {
    const values = await savingsOpenForm({
        title: type === "credit" ? "Add credit" : "Add debit",
        fields: [
            {
                name: "transaction_type",
                label: "Transaction type",
                type: "select",
                options: [
                    { value: "credit", label: "Credit — money in" },
                    { value: "debit", label: "Debit — money out" }
                ],
                value: type
            },
            {
                name: "amount",
                label: "Amount (₹)",
                type: "number",
                min: 0.01,
                step: "0.01"
            },
            {
                name: "transaction_date",
                label: "Date",
                type: "date",
                value: savingsTodayLocal()
            },
            {
                name: "description",
                label: "Description (optional)",
                type: "textarea",
                required: false
            }
        ],
        initial: {
            transaction_type: type,
            transaction_date: savingsTodayLocal(),
            description: ""
        },
        saveLabel: "Save transaction"
    });

    if (!values) return;

    const amount = Number(values.amount);

    if (!Number.isFinite(amount) || amount <= 0 ||
        !savingsValidDate(values.transaction_date) ||
        !["credit", "debit"].includes(values.transaction_type)) {
        return savingsShowSaveError("validation", {
            message: "Check the transaction type, amount and date."
        });
    }

    const { error } = await supabaseClient
        .from("savings_transactions")
        .insert({
            topic_id: topic.id,
            transaction_type: values.transaction_type,
            amount,
            transaction_date: values.transaction_date,
            description: (values.description || "").trim()
        });

    if (error) {
        return savingsShowSaveError("adding the transaction", error);
    }

    await loadSavingsData();
}

async function editSavingsTransaction(transaction) {
    const values = await savingsOpenForm({
        title: "Edit transaction",
        fields: [
            {
                name: "transaction_type",
                label: "Transaction type",
                type: "select",
                options: [
                    { value: "credit", label: "Credit — money in" },
                    { value: "debit", label: "Debit — money out" }
                ]
            },
            {
                name: "amount",
                label: "Amount (₹)",
                type: "number",
                min: 0.01,
                step: "0.01"
            },
            {
                name: "transaction_date",
                label: "Date",
                type: "date"
            },
            {
                name: "description",
                label: "Description (optional)",
                type: "textarea",
                required: false
            }
        ],
        initial: {
            transaction_type: transaction.transaction_type,
            amount: transaction.amount,
            transaction_date: transaction.transaction_date,
            description: transaction.description || ""
        },
        saveLabel: "Save changes"
    });

    if (!values) return;

    const amount = Number(values.amount);

    if (!Number.isFinite(amount) || amount <= 0 ||
        !savingsValidDate(values.transaction_date) ||
        !["credit", "debit"].includes(values.transaction_type)) {
        return savingsShowSaveError("validation", {
            message: "Check the transaction type, amount and date."
        });
    }

    const { error } = await supabaseClient
        .from("savings_transactions")
        .update({
            transaction_type: values.transaction_type,
            amount,
            transaction_date: values.transaction_date,
            description: (values.description || "").trim(),
            updated_at: new Date().toISOString()
        })
        .eq("id", transaction.id);

    if (error) {
        return savingsShowSaveError("updating the transaction", error);
    }

    await loadSavingsData();
}

async function deleteSavingsTransaction(id) {
    const confirmed = await savingsOpenForm({
        title: "Delete transaction?",
        fields: [{
            name: "confirmation",
            label: "Type DELETE to confirm",
            type: "text"
        }],
        saveLabel: "Delete transaction"
    });

    if (!confirmed || confirmed.confirmation.trim() !== "DELETE") return;

    const { error } = await supabaseClient
        .from("savings_transactions")
        .delete()
        .eq("id", id);

    if (error) {
        return savingsShowSaveError("deleting the transaction", error);
    }

    await loadSavingsData();
}

function setupSavings() {
    const monthInput = document.getElementById("savingsMonth");
    const yearSelect = document.getElementById("savingsYear");
    const periodSelect = document.getElementById("savingsPeriod");

    monthInput.value = savingsState.month;

    const currentYear = new Date().getFullYear();
    for (let year = currentYear - 5; year <= currentYear + 5; year++) {
        const option = document.createElement("option");
        option.value = String(year);
        option.textContent = String(year);
        yearSelect.appendChild(option);
    }

    yearSelect.value = savingsState.year;

    periodSelect.addEventListener("change", () => {
        savingsState.period = periodSelect.value;
        document.getElementById("savingsMonthField")
            .classList.toggle("hidden", savingsState.period !== "monthly");
        document.getElementById("savingsYearField")
            .classList.toggle("hidden", savingsState.period !== "yearly");
        loadSavingsData().catch(console.error);
    });

    monthInput.addEventListener("change", () => {
        if (!monthInput.value) return;
        savingsState.month = monthInput.value;
        loadSavingsData().catch(console.error);
    });

    yearSelect.addEventListener("change", () => {
        savingsState.year = yearSelect.value;
        loadSavingsData().catch(console.error);
    });

    document.getElementById("addSavingsTopicButton")
        .addEventListener("click", () => {
            addSavingsTopic().catch(console.error);
        });

    document.getElementById("backToSavingsTopics")
        .addEventListener("click", () => {
            savingsState.selectedTopicId = null;
            renderSavingsDetail();
        });

    document.getElementById("savingsPeriod").dispatchEvent(
        new Event("change")
    );
}

document.addEventListener("DOMContentLoaded", setupSavings);

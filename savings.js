
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

async function addSavingsTopic() {
    const name = prompt("Savings topic name:");
    if (name === null) return;

    if (!name.trim()) {
        alert("Please enter a topic name.");
        return;
    }

    const description = prompt("Description (optional):") || "";

    const { error } = await supabaseClient
        .from("savings_topics")
        .insert({
            name: name.trim(),
            description: description.trim()
        });

    if (error) {
        alert(error.code === "23505"
            ? "A topic with this name already exists."
            : `Could not add topic: ${error.message}`);
        return;
    }

    await loadSavingsData();
}

async function editSavingsTopic(topic) {
    const name = prompt("Edit topic name:", topic.name);
    if (name === null) return;

    if (!name.trim()) {
        alert("Topic name cannot be empty.");
        return;
    }

    const description = prompt(
        "Edit description:",
        topic.description || ""
    );
    if (description === null) return;

    const { error } = await supabaseClient
        .from("savings_topics")
        .update({
            name: name.trim(),
            description: description.trim(),
            updated_at: new Date().toISOString()
        })
        .eq("id", topic.id);

    if (error) {
        alert(`Could not update topic: ${error.message}`);
        return;
    }

    await loadSavingsData();
}

async function setSavingsPlan(topic) {
    const defaultPlan = savingsState.period === "monthly"
        ? savingsState.month
        : `${savingsState.year}-01`;

    const month = prompt(
        "Plan month (YYYY-MM):",
        defaultPlan
    );

    if (month === null) return;

    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
        alert("Enter the month as YYYY-MM.");
        return;
    }

    const existing = savingsState.plans.find(plan =>
        plan.topic_id === topic.id &&
        plan.plan_month === `${month}-01`
    );

    const amount = prompt(
        "Planned amount:",
        existing ? existing.planned_amount : "0"
    );

    if (amount === null) return;

    if (!Number.isFinite(Number(amount)) || Number(amount) < 0) {
        alert("Enter a valid non-negative amount.");
        return;
    }

    const { error } = await supabaseClient
        .from("savings_month_plans")
        .upsert({
            topic_id: topic.id,
            plan_month: `${month}-01`,
            planned_amount: Number(amount),
            updated_at: new Date().toISOString()
        }, {
            onConflict: "topic_id,plan_month"
        });

    if (error) {
        alert(`Could not save plan: ${error.message}`);
        return;
    }

    await loadSavingsData();
}

async function addSavingsTransaction(topic, type) {
    const amount = prompt(
        `${type === "credit" ? "Credit" : "Debit"} amount:`
    );
    if (amount === null) return;

    if (!Number.isFinite(Number(amount)) || Number(amount) <= 0) {
        alert("Enter an amount greater than zero.");
        return;
    }

    const date = prompt(
        "Transaction date (YYYY-MM-DD):",
        new Date().toISOString().slice(0, 10)
    );
    if (date === null) return;

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) ||
        Number.isNaN(Date.parse(`${date}T00:00:00Z`))) {
        alert("Enter the date as YYYY-MM-DD.");
        return;
    }

    const description = prompt("Description (optional):") || "";

    const { error } = await supabaseClient
        .from("savings_transactions")
        .insert({
            topic_id: topic.id,
            transaction_date: date,
            transaction_type: type,
            amount: Number(amount),
            description: description.trim()
        });

    if (error) {
        alert(`Could not add transaction: ${error.message}`);
        return;
    }

    await loadSavingsData();
}

async function editSavingsTransaction(transaction) {
    const amount = prompt("Edit amount:", transaction.amount);
    if (amount === null) return;

    if (!Number.isFinite(Number(amount)) || Number(amount) <= 0) {
        alert("Enter an amount greater than zero.");
        return;
    }

    const type = prompt(
        "Type: enter credit or debit",
        transaction.transaction_type
    );
    if (type === null) return;

    if (!["credit", "debit"].includes(type.trim().toLowerCase())) {
        alert("Type must be credit or debit.");
        return;
    }

    const date = prompt("Date (YYYY-MM-DD):", transaction.transaction_date);
    if (date === null) return;

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) ||
        Number.isNaN(Date.parse(`${date}T00:00:00Z`))) {
        alert("Enter the date as YYYY-MM-DD.");
        return;
    }

    const description = prompt(
        "Description:",
        transaction.description || ""
    );
    if (description === null) return;

    const { error } = await supabaseClient
        .from("savings_transactions")
        .update({
            amount: Number(amount),
            transaction_type: type.trim().toLowerCase(),
            transaction_date: date,
            description: description.trim(),
            updated_at: new Date().toISOString()
        })
        .eq("id", transaction.id);

    if (error) {
        alert(`Could not edit transaction: ${error.message}`);
        return;
    }

    await loadSavingsData();
}

async function deleteSavingsTransaction(id) {
    if (!confirm("Delete this transaction? This cannot be undone.")) return;

    const { error } = await supabaseClient
        .from("savings_transactions")
        .delete()
        .eq("id", id);

    if (error) {
        alert(`Could not delete transaction: ${error.message}`);
        return;
    }

    await loadSavingsData();
}

function showSavingsScreen() {
    document.querySelectorAll(".app-screen").forEach(screen => {
        screen.classList.add("hidden");
    });

    document.getElementById("savingsScreen").classList.remove("hidden");

    // The expense action button should not appear on Savings.
    addExpenseButton.classList.add("hidden");

    loadSavingsData().catch(error => {
        console.error("Savings loading failed:", error);
        document.getElementById("savingsTopicList").innerHTML =
            `<div class="empty-state">Could not load savings. Check your connection and Supabase policies.</div>`;
    });
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

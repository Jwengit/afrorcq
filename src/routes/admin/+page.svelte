<script>
    const navLinks = [
        { label: 'Users' },
        { label: 'Rides' },
        { label: 'Reviews' },
        { label: 'Reports' },
    ];
</script>

<div class="admin-layout">
    <aside class="sidebar">
        <h2>Admin Menu</h2>
        <nav>
            <ul>
                {#each navLinks as link}
                    <li>
                        <a href="#">{link.label}</a>
                    </li>
                {/each}
            </ul>
        </nav>
    </aside>

    <main class="main-content">
        <h1>Admin Dashboard</h1>
        <p>Welcome to the admin dashboard!</p>
    </main>
</div>

<style>
    .admin-layout {
        display: flex;
        height: 100vh;
    }

    .sidebar {
        width: 200px;
        background-color: #f0f0f0;
        padding: 20px;
    }

    .sidebar h2 {
        margin-top: 0;
        margin-bottom: 20px;
    }

    .sidebar nav ul {
        list-style: none;
        padding: 0;
    }

    .sidebar nav li {
        margin-bottom: 10px;
    }

    .sidebar nav a {
        display: block;
        padding: 8px 12px;
        text-decoration: none;
        color: #333;
        border-radius: 4px;
    }

    .sidebar nav a:hover {
        background-color: #ddd;
    }

    .main-content {
        flex: 1;
        padding: 20px;
        background-color: #fff;
    }
</style>
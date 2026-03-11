<script>
let pages = [
"FAQ",
"Girls Only",
"Help Center",
"How it works",
"Privacy Policy",
"Safety",
"Save Money",
"Terms of service"
];
</script>

<div class="dashboard">

<aside class="sidebar">
<h2>Hizli Admin</h2>

<nav>
<a>Users</a>
<a>Rides</a>
<a>Reviews</a>
<a>Reports</a>
<a>Documents</a>
</nav>

<div class="divider"></div>

<h3>Website pages</h3>

{#each pages as page}
<button class="page-btn">{page}</button>
{/each}

</aside>

<main class="main">

<h1>Admin Dashboard</h1>

<div class="stats">

<div class="card">
<h3>Users</h3>
<p>1,245</p>
</div>

<div class="card">
<h3>Active rides</h3>
<p>84</p>
</div>

<div class="card">
<h3>Reviews</h3>
<p>532</p>
</div>

<div class="card">
<h3>Reports</h3>
<p>3</p>
</div>

</div>

<section class="content">

<h2>Manage website pages</h2>

<p>Select a page to edit its content.</p>

<div class="pages">

{#each pages as page}

<div class="page-card">
<h3>{page}</h3>
<button>Edit page</button>
</div>

{/each}

</div>

</section>

</main>

</div>

<style>

.dashboard{
display:flex;
height:100vh;
font-family:Arial;
background:#f5f7fb;
}

.sidebar{
width:260px;
background:white;
padding:30px;
border-right:1px solid #eee;
}

.sidebar h2{
margin-bottom:30px;
color:#2BB573;
}

.sidebar nav{
display:flex;
flex-direction:column;
gap:12px;
margin-bottom:20px;
}

.sidebar nav a{
cursor:pointer;
color:#333;
font-weight:500;
}

.sidebar nav a:hover{
color:#2BB573;
}

.divider{
height:1px;
background:#eee;
margin:20px 0;
}

.page-btn{
width:100%;
padding:8px;
border:none;
background:#f3f3f3;
margin-bottom:8px;
cursor:pointer;
border-radius:6px;
}

.page-btn:hover{
background:#2BB573;
color:white;
}

.main{
flex:1;
padding:40px;
}

.stats{
display:grid;
grid-template-columns:repeat(4,1fr);
gap:20px;
margin-bottom:40px;
}

.card{
background:white;
padding:25px;
border-radius:10px;
box-shadow:0 4px 10px rgba(0,0,0,0.05);
}

.card h3{
margin-bottom:10px;
}

.card p{
font-size:24px;
font-weight:bold;
}

.content{
background:white;
padding:30px;
border-radius:10px;
box-shadow:0 4px 10px rgba(0,0,0,0.05);
}

.pages{
display:grid;
grid-template-columns:repeat(3,1fr);
gap:20px;
margin-top:20px;
}

.page-card{
background:#fafafa;
padding:20px;
border-radius:8px;
border:1px solid #eee;
display:flex;
justify-content:space-between;
align-items:center;
}

.page-card button{
background:#2BB573;
border:none;
color:white;
padding:8px 14px;
border-radius:6px;
cursor:pointer;
}

.page-card button:hover{
opacity:0.9;
}

</style>
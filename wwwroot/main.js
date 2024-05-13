import { initViewer, loadModel } from './viewer.js';
import { initTree } from './sidebar.js';

const login = document.getElementById('login');

// const thumbnailscontainer = document.getElementById('itens-container');
// thumbnailscontainer.toggleAttribute('mouse-dragging', true);

const viewerContainer = document.getElementById('preview');
const imagesContainer  = document.getElementById('image-comparer');
try {
    const resp = await fetch('/api/auth/profile');
    if (resp.ok) {
        // thumbnailsContainer.style.visibility = 'hidden';
        const user = await resp.json();
        login.innerText = `Logout (${user.name})`;
        login.onclick = () => window.location.replace('/api/auth/logout');
        GLOBAL_VIEWER = await initViewer(viewerContainer);
        initTree('#tree', (id) => loadModel(GLOBAL_VIEWER, window.btoa(id).replace(/=/g, '')));
        CURRENT_MODEL = "racbasicsampleproject.rvt" 
        const res = loadModel(GLOBAL_VIEWER, "dXJuOmFkc2sub2JqZWN0czpvcy5vYmplY3Q6anBvbS1kZW1vLXNhbXBsZS1ub2h1Yi9yYWNiYXNpY3NhbXBsZXByb2plY3QucnZ0");      
    } else {
        login.innerText = 'Login';
        login.onclick = () => window.location.replace('/api/auth/login');
    }
    login.style.visibility = 'visible';
} catch (err) {
    alert('Could not initialize the application. See console for more details.');
    console.error(err);
}
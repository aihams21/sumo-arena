// ملف إدارة الحساب، تعديل الاسم، علم الدولة، ورفع الصورة الشخصية المستقل 100%
function openAccountModal() {
  const sidebar = document.getElementById('neon-sidebar');
  if (sidebar) sidebar.style.right = '-320px';
  
  const lbModal = document.getElementById('leaderboard-modal');
  if (lbModal) lbModal.style.display = 'none';

  const modal = document.getElementById('account-modal');
  if (modal) {
    modal.style.display = 'flex';
    document.getElementById('input-name').value = localStorage.getItem('sumo_name') || 'aiham';
    document.getElementById('input-flag').value = localStorage.getItem('sumo_flag') || 'Jordan 🇯🇴';
  }
}

function closeAccountModal() {
  const modal = document.getElementById('account-modal');
  if (modal) modal.style.display = 'none';
}

function saveAccount() {
  const name = document.getElementById('input-name').value;
  const flag = document.getElementById('input-flag').value;
  if(name) localStorage.setItem('sumo_name', name);
  if(flag) localStorage.setItem('sumo_flag', flag);
  updateAccountUI();
  closeAccountModal();
  location.reload();
}

function loadAvatar(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(e) {
    localStorage.setItem('sumo_avatar', e.target.result);
    updateAccountUI();
  };
  reader.readAsDataURL(file);
}

function updateAccountUI() {
  const savedName = localStorage.getItem('sumo_name');
  const savedFlag = localStorage.getItem('sumo_flag');
  const savedAvatar = localStorage.getItem('sumo_avatar');
  
  if(savedName) {
    const sName = document.getElementById('sidebar-name');
    if(sName) sName.innerText = savedName;
  }
  if(savedFlag) {
    const sFlag = document.getElementById('sidebar-flag');
    if(sFlag) sFlag.innerText = savedFlag;
  }
  if(savedAvatar) {
    const sAvatar = document.getElementById('sidebar-avatar');
    if(sAvatar) sAvatar.src = savedAvatar;
  }
}

window.addEventListener('DOMContentLoaded', updateAccountUI);

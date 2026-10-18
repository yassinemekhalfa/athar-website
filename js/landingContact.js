const form = document.getElementById('contact-brief');
const status = document.getElementById('contact-form-status');
let selectedChannel = 'whatsapp';

function briefMessage(data) {
  const english = document.documentElement.lang === 'en';
  const services = data.getAll('services').join('، ') || (english ? 'Not selected' : 'غير محدد');
  return [
    english ? 'Hello Athar, I would like to discuss a project.' : 'مرحبًا أثر، أود مناقشة مشروع.',
    '',
    `${english ? 'Name' : 'الاسم'}: ${data.get('name')}`,
    `${english ? 'Company' : 'الشركة'}: ${data.get('company')}`,
    `${english ? 'Industry' : 'القطاع'}: ${data.get('sector')}`,
    `${english ? 'Services' : 'الخدمات'}: ${services}`,
    `${english ? 'Expected outcome' : 'النتيجة المطلوبة'}: ${data.get('outcome')}`
  ].join('\n');
}

form?.querySelectorAll('button[name="channel"]').forEach(button => {
  button.addEventListener('click', () => { selectedChannel = button.value; });
});

form?.addEventListener('submit', event => {
  event.preventDefault();
  if (!form.reportValidity()) return;
  const message = briefMessage(new FormData(form));
  const channel = event.submitter?.value || selectedChannel;
  const url = channel === 'email'
    ? `mailto:Oussama@atharmarketing.agency?subject=${encodeURIComponent('Athar project brief')}&body=${encodeURIComponent(message)}`
    : `https://wa.me/213797791948?text=${encodeURIComponent(message)}`;
  if (status) {
    const english = document.documentElement.lang === 'en';
    status.replaceChildren(document.createTextNode(english ? `Opening ${channel === 'email' ? 'your email app' : 'WhatsApp'}… ` : `جارٍ فتح ${channel === 'email' ? 'البريد الإلكتروني' : 'واتساب'}… `));
    const fallback = document.createElement('a');
    fallback.href = url;
    fallback.textContent = english ? 'Open it here' : 'افتحه من هنا';
    status.append(fallback);
  }
  // Direct navigation works reliably on mobile browsers that block popups.
  window.location.href = url;
});

// Keep process steps animated if ScrollTrigger is unavailable or delayed.
const steps = [...document.querySelectorAll('.step')];
if ('IntersectionObserver' in window) {
  const observer = new IntersectionObserver(entries => {
    for (const entry of entries) entry.target.classList.toggle('on', entry.isIntersecting || entry.boundingClientRect.top < innerHeight * .55);
  }, { rootMargin: '-20% 0px -25%', threshold: .15 });
  steps.forEach(step => observer.observe(step));
} else {
  steps.forEach(step => step.classList.add('on'));
}

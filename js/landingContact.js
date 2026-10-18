const form = document.getElementById('contact-brief');

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

form?.addEventListener('submit', event => {
  event.preventDefault();
  if (!form.reportValidity()) return;
  const message = briefMessage(new FormData(form));
  const channel = event.submitter?.value || 'whatsapp';
  const url = channel === 'email'
    ? `mailto:Oussama@atharmarketing.agency?subject=${encodeURIComponent('Athar project brief')}&body=${encodeURIComponent(message)}`
    : `https://wa.me/213797791948?text=${encodeURIComponent(message)}`;
  window.open(url, channel === 'email' ? '_self' : '_blank', channel === 'email' ? undefined : 'noopener');
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

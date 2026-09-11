const header = document.querySelector('.site-header');
const navToggle = document.querySelector('.nav-toggle');
const siteNav = document.querySelector('.site-nav');
const modal = document.querySelector('#bookingModal');
const lightbox = document.querySelector('#lightbox');
const yearNode = document.getElementById('year');
const openModalButtons = document.querySelectorAll('[data-open-modal]');
const closeModalButtons = document.querySelectorAll('[data-close-modal]');
const galleryItems = document.querySelectorAll('.gallery-item');
const lightboxImage = document.querySelector('.lightbox img');
const contactForm = document.querySelector('.contact-form');
const bookingForm = document.querySelector('.booking-form');

if (yearNode) {
  yearNode.textContent = new Date().getFullYear();
}

const closeMobileNav = () => {
  if (siteNav) {
    siteNav.classList.remove('is-open');
  }

  if (navToggle) {
    navToggle.setAttribute('aria-expanded', 'false');
  }
};

window.addEventListener('scroll', () => {
  if (!header) return;
  header.classList.toggle('scrolled', window.scrollY > 20);
});

if (navToggle && siteNav) {
  navToggle.addEventListener('click', () => {
    const isOpen = siteNav.classList.toggle('is-open');
    navToggle.setAttribute('aria-expanded', String(isOpen));
  });

  siteNav.querySelectorAll('a').forEach((link) => {
    link.addEventListener('click', closeMobileNav);
  });
}

const openModal = () => {
  if (!modal) return;
  modal.classList.add('is-open');
  modal.setAttribute('aria-hidden', 'false');
};

const closeModal = () => {
  if (!modal) return;
  modal.classList.remove('is-open');
  modal.setAttribute('aria-hidden', 'true');
};

openModalButtons.forEach((button) => {
  button.addEventListener('click', openModal);
});

closeModalButtons.forEach((button) => {
  button.addEventListener('click', closeModal);
});

if (modal) {
  modal.addEventListener('click', (event) => {
    if (event.target === modal || event.target.classList.contains('modal-backdrop')) {
      closeModal();
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && modal.classList.contains('is-open')) {
      closeModal();
    }
  });
}

galleryItems.forEach((item) => {
  item.addEventListener('click', () => {
    const fullImage = item.dataset.full;
    if (!lightbox || !lightboxImage || !fullImage) return;

    lightboxImage.src = fullImage;
    lightbox.classList.add('is-open');
    lightbox.setAttribute('aria-hidden', 'false');
  });
});

if (lightbox) {
  const closeLightbox = () => {
    lightbox.classList.remove('is-open');
    lightbox.setAttribute('aria-hidden', 'true');
  };

  lightbox.addEventListener('click', (event) => {
    if (event.target === lightbox) {
      closeLightbox();
    }
  });

  const closeButton = document.querySelector('.lightbox-close');
  if (closeButton) {
    closeButton.addEventListener('click', closeLightbox);
  }

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && lightbox.classList.contains('is-open')) {
      closeLightbox();
    }
  });
}

if (contactForm) {
  contactForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const submitButton = contactForm.querySelector('button[type="submit"]');
    if (submitButton) {
      submitButton.textContent = 'Message Sent';
      submitButton.disabled = true;
    }
  });
}

if (bookingForm) {
  bookingForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const submitButton = bookingForm.querySelector('button[type="submit"]');

    if (submitButton) {
      submitButton.textContent = 'Reservation Requested';
      submitButton.disabled = true;
    }

    setTimeout(() => {
      closeModal();
      if (submitButton) {
        submitButton.textContent = 'Confirm Reservation';
        submitButton.disabled = false;
      }
      bookingForm.reset();
    }, 1600);
  });
}

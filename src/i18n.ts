import {
  createElement,
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

export type Language = 'en' | 'nl'

const STORAGE_KEY = 'halal-delivery-language'

const englishCopy = {
  meta: {
    title: 'Halal Delivery — Eat well. Do good.',
    description:
      'Discover trusted halal restaurants near you and support a local cause with every order.',
  },
  common: {
    minutesShort: 'min',
    languages: {
      en: 'English',
      nl: 'Dutch',
    },
  },
  header: {
    homeAria: 'Halal Delivery home',
    nav: {
      findFood: 'Find food',
      impact: 'Our impact',
      howItWorks: 'How it works',
    },
    bagAria: (count: number) => `${count} item${count === 1 ? '' : 's'} in bag`,
    login: 'Log in',
    mobileToggle: 'Toggle navigation',
    languageSwitcher: 'Choose language',
  },
  hero: {
    eyebrow: 'Eat well. Do good.',
    title: 'Your favourite halal food,',
    titleAccent: 'delivered with purpose.',
    lead:
      'Discover trusted halal kitchens near you. Every order supports a local cause you can choose yourself.',
    addressLabel: 'Delivery address',
    addressPlaceholder: 'Enter your street, house number and city',
    useLocation: 'Use my location',
    searching: 'Searching...',
    findFood: 'Find food',
    currentLocation: 'your current location',
    errors: {
      emptyAddress: 'Enter your street, house number and city.',
    },
    trust: {
      verified: 'Halal verified',
      charity: 'Local cause included',
      delivery: 'Local delivery',
    },
    visualAria: 'A shared halal meal',
    imageAlt: 'Colourful halal dishes shared around a table',
    rating: {
      title: 'Average 4.8',
      subtitle: 'Trusted local kitchens',
    },
    orderImpact: {
      title: '€1.25 donated',
      subtitle: 'through this order',
    },
    seal: '100% halal',
  },
  proof: {
    partners: {
      value: '100%',
      label: 'halal partners',
    },
    causes: {
      value: '3',
      label: 'local causes',
    },
    orders: {
      value: 'Every order',
      label: 'makes a difference',
    },
  },
  restaurants: {
    kicker: 'Near you',
    title: (area: string) => `Delicious food around ${area}`,
    sortedByDistance:
      'Partners are sorted by distance, including places just outside your delivery area.',
    curated: 'Carefully selected, halal-verified kitchens ready to deliver.',
    searchLabel: 'Search for a restaurant',
    searchPlaceholder: 'Search restaurant or cuisine',
    clearSearch: 'Clear restaurant search',
    loading: 'Finding great halal kitchens...',
    errorTitle: 'Restaurants could not be loaded.',
    errorHelp: 'Start PostgreSQL, run `pnpm db:reset`, then start the API.',
    distance: (distance: string) => `${distance} km away`,
    minimumOrder: 'Min.',
    freeDelivery: 'Free delivery',
    deliveryFee: (amount: string) => `${amount} delivery`,
    givesBack: 'Gives back',
    deliversToYou: 'Delivers to you',
    viewOnly: 'View only',
    noResults: (query: string) =>
      `No restaurants found for “${query}”. Try another name or cuisine.`,
  },
  impact: {
    kicker: 'More than a meal',
    title: 'Dinner can do good.',
    lead:
      "A transparent share of our platform revenue supports trusted organisations. At checkout, you decide where your order's contribution goes.",
    points: [
      {
        title: 'Local first',
        description: 'See causes supporting people in your area.',
      },
      {
        title: 'Your choice',
        description: 'Pick the organisation that matters most to you.',
      },
      {
        title: 'Clear impact',
        description: 'See exactly what your order contributes.',
      },
    ],
    cta: 'Explore our causes',
    imageAlt: 'Community volunteers working together',
    counter: {
      intro: 'Together we have contributed',
      amount: '€12,480',
      caption: 'Community demo impact',
    },
  },
  causes: {
    kicker: 'Choose your impact',
    title: 'Local causes, close to home',
    lead: 'We highlight verified organisations that are active in your area first.',
  },
  howItWorks: {
    kicker: 'Thoughtfully simple',
    title: 'From craving to contribution',
    steps: [
      {
        title: 'Tell us where you are',
        description: 'Enter your address and see halal kitchens that deliver to you.',
      },
      {
        title: 'Pick your favourites',
        description: 'Browse menus and order from a restaurant you trust.',
      },
      {
        title: 'Choose your cause',
        description: 'Direct the contribution at checkout to a local organisation.',
      },
    ],
  },
  footer: {
    tagline: 'Halal food, delivered with purpose.',
    discover: {
      title: 'Discover',
      restaurants: 'Restaurants',
      impact: 'Our impact',
    },
    partners: {
      title: 'Partners',
      charities: 'Charities',
      portal: 'Restaurant portal',
    },
    support: {
      title: 'Support',
      help: 'Help centre',
      contact: 'Contact',
    },
    copyright: '© 2026 Halal Delivery',
    builtIn: 'Built with purpose in Amsterdam.',
  },
  menu: {
    dialogAria: (restaurant: string) => `${restaurant} menu`,
    close: 'Close menu',
    freeDelivery: 'Free delivery',
    popular: 'Popular',
    add: (item: string) => `Add ${item}`,
    addOne: (item: string) => `Add one ${item}`,
    removeOne: (item: string) => `Remove one ${item}`,
  },
  checkout: {
    dialogAria: 'Demo checkout',
    close: 'Close checkout',
    kicker: 'Secure demo checkout',
    completeTitle: 'Payment complete',
    reviewTitle: 'Review your order',
    done: 'Done',
    order: {
      title: 'Your order',
      each: 'each',
      total: 'Total',
    },
    impact: {
      title: 'Choose your impact',
      lead: 'Optional — skip this with no penalty.',
      skip: 'No donation this time',
      direct: 'Direct our contribution',
      explainer: (amount: string) =>
        `Halal Delivery will allocate ${amount} from its commission. This does not increase your total. Select up to three causes and the amount is shared equally.`,
    },
    payment: {
      title: 'Demo payment',
      lead: 'No real money or card details are processed.',
      card: 'Credit card',
      simulation: 'Demo simulation',
      cardNumber: 'Card number',
      expiry: 'Expiry',
      cvc: 'CVC',
      processing: 'Processing demo payment...',
      pay: (amount: string) => `Pay ${amount}`,
      disclaimer: 'Demo only · no real charge',
    },
    receipt: {
      kicker: 'Demo payment successful',
      title: 'Thank you for ordering with purpose.',
      lead:
        'Your order has been saved to the demo ledger and will appear in the admin monthly report.',
      reference: 'Order reference',
      paidToPlatform: 'Paid to Halal Delivery',
      restaurantPayout: 'Restaurant payout',
      platformCommission: 'Platform commission',
      charityDonation: 'Charity donation',
      emailSimulated: 'A POC confirmation email has been simulated. You can now review this order from your account.',
      accountCta: 'View order and leave a review',
      signInToReview: 'Sign in before ordering to save the order and leave a verified review.',
    },
    empty: {
      title: 'Your bag is empty',
      lead: 'Choose a restaurant and add a delicious item first.',
      cta: 'Find food',
    },
  },
  login: {
    title: 'Welcome back',
    lead: 'Sign in to order food or manage your Halal Delivery workspace.',
    signInTab: 'Sign in',
    registerTab: 'Create account',
    name: 'Full name',
    email: 'Email address',
    password: 'Password',
    confirmPassword: 'Confirm password',
    submit: 'Sign in',
    signingIn: 'Signing in...',
    registerSubmit: 'Create my account',
    registering: 'Creating account...',
    passwordHint: 'Use 12+ characters with upper-case, lower-case, a number and a symbol.',
    passwordMismatch: 'The passwords do not match.',
    google: 'Continue with Google',
    googleUnavailable: 'Google sign-in will appear here once the Google Client ID is configured.',
    or: 'or use your email',
    error: 'Sign-in failed. Check your email address and password.',
    backToDiscovery: 'Return to discovery',
    secureNote: 'Your session is protected and expires automatically.',
    unverifiedNote: 'Manual accounts work immediately for this POC. Email verification will be added with the future email provider.',
    signOut: 'Sign out',
  },
  account: {
    title: 'Your orders',
    lead: 'Review confirmed orders and share feedback from your verified purchase history.',
    backToDiscovery: 'Back to food discovery',
    loading: 'Loading your orders...',
    error: 'Your order history could not be loaded.',
    emptyTitle: 'No saved orders yet',
    emptyLead: 'Sign in before checkout and your confirmed orders will appear here.',
    orderReference: 'Order',
    confirmed: 'Confirmed',
    total: 'Order total',
    donation: 'Charity allocation',
    items: 'Order details',
    emailSimulated: 'POC confirmation email simulated',
    emailSent: 'Confirmation email sent',
    emailPending: 'Confirmation email pending',
    reviewTitle: 'Your restaurant review',
    reviewLead: 'Only customers with a confirmed order and confirmation email can publish a review.',
    ratingAria: (rating: number) => `${rating} star${rating === 1 ? '' : 's'}`,
    commentLabel: 'Tell others about your order',
    commentPlaceholder: 'How was the food, packaging and delivery experience?',
    submitReview: 'Publish review',
    updateReview: 'Update review',
    saving: 'Saving review...',
    saved: 'Your verified-order review is published.',
    notEligible: 'Review access will unlock after order confirmation and the confirmation email.',
  },
}

type AppCopy = typeof englishCopy

const dictionaries: Record<Language, AppCopy> = {
  en: englishCopy,
  nl: {
    meta: {
      title: 'Halal Delivery — Eet goed. Doe goed.',
      description:
        'Ontdek betrouwbare halalrestaurants bij jou in de buurt en steun een lokaal doel met iedere bestelling.',
    },
    common: {
      minutesShort: 'min',
      languages: {
        en: 'Engels',
        nl: 'Nederlands',
      },
    },
    header: {
      homeAria: 'Halal Delivery startpagina',
      nav: {
        findFood: 'Vind eten',
        impact: 'Onze impact',
        howItWorks: 'Zo werkt het',
      },
      bagAria: (count: number) => `${count} product${count === 1 ? '' : 'en'} in tas`,
      login: 'Inloggen',
      mobileToggle: 'Navigatie openen of sluiten',
      languageSwitcher: 'Kies taal',
    },
    hero: {
      eyebrow: 'Eet goed. Doe goed.',
      title: 'Jouw favoriete halaleten,',
      titleAccent: 'bezorgd met betekenis.',
      lead:
        'Ontdek betrouwbare halalkeukens bij jou in de buurt. Met iedere bestelling steun je een lokaal doel dat je zelf kiest.',
      addressLabel: 'Bezorgadres',
      addressPlaceholder: 'Vul je straat, huisnummer en plaats in',
      useLocation: 'Gebruik mijn locatie',
      searching: 'Zoeken...',
      findFood: 'Vind eten',
      currentLocation: 'jouw huidige locatie',
      errors: {
        emptyAddress: 'Vul een straat, huisnummer en plaats in.',
      },
      trust: {
        verified: 'Halal geverifieerd',
        charity: 'Goed doel inbegrepen',
        delivery: 'Lokale bezorging',
      },
      visualAria: 'Een gedeelde halalmaaltijd',
      imageAlt: 'Kleurrijke halalgerechten gedeeld rond een tafel',
      rating: {
        title: 'Gemiddeld 4,8',
        subtitle: 'Betrouwbare lokale keukens',
      },
      orderImpact: {
        title: '€ 1,25 gedoneerd',
        subtitle: 'via deze bestelling',
      },
      seal: '100% halal',
    },
    proof: {
      partners: {
        value: '100%',
        label: 'halalpartners',
      },
      causes: {
        value: '3',
        label: 'lokale doelen',
      },
      orders: {
        value: 'Iedere bestelling',
        label: 'maakt verschil',
      },
    },
    restaurants: {
      kicker: 'Bij jou in de buurt',
      title: (area: string) => `Lekker eten rondom ${area}`,
      sortedByDistance:
        'Alle partners staan op afstand gesorteerd, ook buiten jouw bezorggebied.',
      curated:
        'Zorgvuldig geselecteerde, halal geverifieerde keukens die klaarstaan om te bezorgen.',
      searchLabel: 'Zoek een restaurant',
      searchPlaceholder: 'Zoek restaurant of keuken',
      clearSearch: 'Wis restaurantzoekopdracht',
      loading: 'Goede halalkeukens zoeken...',
      errorTitle: 'Restaurants konden niet worden geladen.',
      errorHelp: 'Start PostgreSQL, voer `pnpm db:reset` uit en start daarna de API.',
      distance: (distance: string) => `${distance} km afstand`,
      minimumOrder: 'Min.',
      freeDelivery: 'Gratis bezorging',
      deliveryFee: (amount: string) => `${amount} bezorging`,
      givesBack: 'Draagt bij',
      deliversToYou: 'Bezorgt bij jou',
      viewOnly: 'Alleen bekijken',
      noResults: (query: string) =>
        `Geen restaurants gevonden voor “${query}”. Probeer een andere naam of keuken.`,
    },
    impact: {
      kicker: 'Meer dan een maaltijd',
      title: 'Avondeten kan goed doen.',
      lead:
        'Een transparant deel van onze platformopbrengst steunt betrouwbare organisaties. Bij het afrekenen kies jij waar de bijdrage van jouw bestelling naartoe gaat.',
      points: [
        {
          title: 'Lokaal voorop',
          description: 'Bekijk doelen die mensen bij jou in de buurt helpen.',
        },
        {
          title: 'Jouw keuze',
          description: 'Kies de organisatie die jou het meest aanspreekt.',
        },
        {
          title: 'Duidelijke impact',
          description: 'Zie precies wat jouw bestelling bijdraagt.',
        },
      ],
      cta: 'Bekijk onze doelen',
      imageAlt: 'Vrijwilligers uit de gemeenschap werken samen',
      counter: {
        intro: 'Samen hebben we bijgedragen',
        amount: '€ 12.480',
        caption: 'Demo-impact voor de gemeenschap',
      },
    },
    causes: {
      kicker: 'Kies jouw impact',
      title: 'Goede doelen dichtbij huis',
      lead: 'We tonen eerst geverifieerde organisaties die actief zijn in jouw omgeving.',
    },
    howItWorks: {
      kicker: 'Bewust eenvoudig',
      title: 'Van trek naar bijdrage',
      steps: [
        {
          title: 'Vertel waar je bent',
          description: 'Vul je adres in en bekijk halalkeukens die bij jou bezorgen.',
        },
        {
          title: 'Kies je favorieten',
          description: "Bekijk menu's en bestel bij een restaurant dat je vertrouwt.",
        },
        {
          title: 'Kies je doel',
          description:
            'Wijs de bijdrage bij het afrekenen toe aan een lokale organisatie.',
        },
      ],
    },
    footer: {
      tagline: 'Halaleten, bezorgd met betekenis.',
      discover: {
        title: 'Ontdek',
        restaurants: 'Restaurants',
        impact: 'Onze impact',
      },
      partners: {
        title: 'Partners',
        charities: 'Goede doelen',
        portal: 'Restaurantportaal',
      },
      support: {
        title: 'Ondersteuning',
        help: 'Helpcentrum',
        contact: 'Contact',
      },
      copyright: '© 2026 Halal Delivery',
      builtIn: 'Met betekenis gebouwd in Amsterdam.',
    },
    menu: {
      dialogAria: (restaurant: string) => `Menu van ${restaurant}`,
      close: 'Menu sluiten',
      freeDelivery: 'Gratis bezorging',
      popular: 'Populair',
      add: (item: string) => `${item} toevoegen`,
      addOne: (item: string) => `Nog één ${item} toevoegen`,
      removeOne: (item: string) => `Eén ${item} verwijderen`,
    },
    checkout: {
      dialogAria: 'Demo-afrekenen',
      close: 'Afrekenen sluiten',
      kicker: 'Veilige demo-checkout',
      completeTitle: 'Betaling voltooid',
      reviewTitle: 'Controleer je bestelling',
      done: 'Klaar',
      order: {
        title: 'Jouw bestelling',
        each: 'per stuk',
        total: 'Totaal',
      },
      impact: {
        title: 'Kies jouw impact',
        lead: 'Optioneel — je kunt dit zonder nadeel overslaan.',
        skip: 'Deze keer geen donatie',
        direct: 'Wijs onze bijdrage toe',
        explainer: (amount: string) =>
          `Halal Delivery reserveert ${amount} uit de commissie. Dit verhoogt jouw totaal niet. Selecteer maximaal drie doelen; het bedrag wordt gelijk verdeeld.`,
      },
      payment: {
        title: 'Demo-betaling',
        lead:
          'Er wordt geen echt geld afgeschreven en geen echte kaartinformatie verwerkt.',
        card: 'Creditcard',
        simulation: 'Demo-simulatie',
        cardNumber: 'Kaartnummer',
        expiry: 'Vervaldatum',
        cvc: 'CVC',
        processing: 'Demo-betaling verwerken...',
        pay: (amount: string) => `${amount} betalen`,
        disclaimer: 'Alleen demo · geen echte afschrijving',
      },
      receipt: {
        kicker: 'Demo-betaling geslaagd',
        title: 'Bedankt dat je met betekenis bestelt.',
        lead:
          'Je bestelling is opgeslagen in het demologboek en verschijnt nu in het maandrapport voor beheerders.',
        reference: 'Bestelreferentie',
        paidToPlatform: 'Betaald aan Halal Delivery',
        restaurantPayout: 'Uitbetaling restaurant',
        platformCommission: 'Platformcommissie',
        charityDonation: 'Donatie aan goed doel',
        emailSimulated: 'Er is een POC-bevestigingsmail gesimuleerd. Je kunt deze bestelling nu beoordelen via je account.',
        accountCta: 'Bekijk bestelling en plaats een beoordeling',
        signInToReview: 'Log voor het bestellen in om de bestelling op te slaan en een geverifieerde beoordeling te plaatsen.',
      },
      empty: {
        title: 'Je tas is leeg',
        lead: 'Kies eerst een restaurant en voeg iets lekkers toe.',
        cta: 'Vind eten',
      },
    },
    login: {
      title: 'Welkom terug',
      lead: 'Log in om eten te bestellen of je Halal Delivery-werkruimte te beheren.',
      signInTab: 'Inloggen',
      registerTab: 'Account maken',
      name: 'Volledige naam',
      email: 'E-mailadres',
      password: 'Wachtwoord',
      confirmPassword: 'Bevestig wachtwoord',
      submit: 'Inloggen',
      signingIn: 'Bezig met inloggen...',
      registerSubmit: 'Mijn account maken',
      registering: 'Account wordt gemaakt...',
      passwordHint: 'Gebruik 12+ tekens met hoofdletter, kleine letter, cijfer en symbool.',
      passwordMismatch: 'De wachtwoorden komen niet overeen.',
      google: 'Doorgaan met Google',
      googleUnavailable: 'Google-inloggen verschijnt hier zodra de Google Client ID is ingesteld.',
      or: 'of gebruik je e-mailadres',
      error: 'Inloggen mislukt. Controleer je e-mailadres en wachtwoord.',
      backToDiscovery: 'Terug naar ontdekken',
      secureNote: 'Je sessie is beveiligd en verloopt automatisch.',
      unverifiedNote: 'Handmatige accounts werken direct voor deze POC. E-mailverificatie wordt later toegevoegd met de e-mailprovider.',
      signOut: 'Uitloggen',
    },
    account: {
      title: 'Jouw bestellingen',
      lead: 'Bekijk bevestigde bestellingen en deel feedback vanuit je geverifieerde aankoopgeschiedenis.',
      backToDiscovery: 'Terug naar eten ontdekken',
      loading: 'Je bestellingen worden geladen...',
      error: 'Je bestelgeschiedenis kon niet worden geladen.',
      emptyTitle: 'Nog geen opgeslagen bestellingen',
      emptyLead: 'Log voor het afrekenen in; bevestigde bestellingen verschijnen daarna hier.',
      orderReference: 'Bestelling',
      confirmed: 'Bevestigd',
      total: 'Besteltotaal',
      donation: 'Toewijzing goed doel',
      items: 'Bestelgegevens',
      emailSimulated: 'POC-bevestigingsmail gesimuleerd',
      emailSent: 'Bevestigingsmail verzonden',
      emailPending: 'Bevestigingsmail in behandeling',
      reviewTitle: 'Jouw restaurantbeoordeling',
      reviewLead: 'Alleen klanten met een bevestigde bestelling en bevestigingsmail kunnen een beoordeling publiceren.',
      ratingAria: (rating: number) => `${rating} ster${rating === 1 ? '' : 'ren'}`,
      commentLabel: 'Vertel anderen over je bestelling',
      commentPlaceholder: 'Hoe waren het eten, de verpakking en de bezorgervaring?',
      submitReview: 'Beoordeling publiceren',
      updateReview: 'Beoordeling bijwerken',
      saving: 'Beoordeling opslaan...',
      saved: 'Je beoordeling van een geverifieerde bestelling is gepubliceerd.',
      notEligible: 'Beoordelen wordt beschikbaar na de bestelbevestiging en bevestigingsmail.',
    },
  },
}

type I18nContextValue = {
  language: Language
  setLanguage: (language: Language) => void
  copy: AppCopy
}

const I18nContext = createContext<I18nContextValue | null>(null)

const serverMessageTranslations: Record<string, Record<Language, string>> = {
  DISCOVERY_UNAVAILABLE: {
    en: 'The restaurant service is unavailable.',
    nl: 'De restaurantservice is niet beschikbaar.',
  },
  ADDRESS_NOT_FOUND: {
    en: 'We could not find that address. Include the street, house number and city.',
    nl: 'We konden dat adres niet vinden. Voeg de straat, het huisnummer en de plaats toe.',
  },
  GEOLOCATION_UNSUPPORTED: {
    en: 'Location services are not supported by this browser.',
    nl: 'Locatiebepaling wordt niet ondersteund door deze browser.',
  },
  GEOLOCATION_DENIED: {
    en: 'Location access was denied. Enter your address manually.',
    nl: 'Locatietoegang is geweigerd. Vul je adres handmatig in.',
  },
  CHECKOUT_FAILED: {
    en: 'The demo payment could not be completed.',
    nl: 'De demo-betaling kon niet worden voltooid.',
  },
  'Enter a complete Dutch delivery address.': {
    en: 'Enter a complete Dutch delivery address.',
    nl: 'Voer een volledig Nederlands bezorgadres in.',
  },
  'The Dutch address service is temporarily unavailable.': {
    en: 'The Dutch address service is temporarily unavailable.',
    nl: 'De Nederlandse adresservice is tijdelijk niet beschikbaar.',
  },
  'We could not find that address. Include the street, house number and city.': {
    en: 'We could not find that address. Include the street, house number and city.',
    nl: 'We konden dat adres niet vinden. Voeg de straat, het huisnummer en de plaats toe.',
  },
  'The POC checkout contains invalid items or donation choices.': {
    en: 'The demo checkout contains invalid items or donation choices.',
    nl: 'De demo-checkout bevat ongeldige items of donatiekeuzes.',
  },
  'One or more menu items are unavailable.': {
    en: 'One or more menu items are unavailable.',
    nl: 'Een of meer menu-items zijn niet beschikbaar.',
  },
  'One or more selected charities are unavailable.': {
    en: 'One or more selected charities are unavailable.',
    nl: 'Een of meer geselecteerde goede doelen zijn niet beschikbaar.',
  },
  'This restaurant does not have an active commercial agreement.': {
    en: 'This restaurant does not have an active commercial agreement.',
    nl: 'Dit restaurant heeft geen actieve commerciële overeenkomst.',
  },
  'Invalid restaurant identifier.': {
    en: 'The selected restaurant is invalid.',
    nl: 'Het geselecteerde restaurant is ongeldig.',
  },
  'Restaurant not found.': {
    en: 'The selected restaurant could not be found.',
    nl: 'Het geselecteerde restaurant kon niet worden gevonden.',
  },
}

function resolveInitialLanguage(): Language {
  if (typeof window === 'undefined') {
    return 'en'
  }

  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    return stored === 'nl' ? 'nl' : 'en'
  } catch {
    return 'en'
  }
}

export function localizeServerMessage(message: string, language: Language) {
  return serverMessageTranslations[message]?.[language] ?? message
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<Language>(resolveInitialLanguage)
  const copy = dictionaries[language]

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, language)
    } catch {
      // Ignore storage failures and keep the in-memory preference.
    }

    document.documentElement.lang = language
    document.title = copy.meta.title
    document
      .querySelector('meta[name="description"]')
      ?.setAttribute('content', copy.meta.description)
  }, [copy.meta.description, copy.meta.title, language])

  const value = useMemo(() => ({ language, setLanguage, copy }), [copy, language])

  return createElement(I18nContext.Provider, { value }, children)
}

export function useI18n() {
  const context = useContext(I18nContext)
  if (!context) {
    throw new Error('I18nProvider is missing.')
  }
  return context
}

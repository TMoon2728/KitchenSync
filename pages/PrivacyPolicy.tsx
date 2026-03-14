import React from 'react';

const PrivacyPolicy: React.FC = () => {
  return (
    <div className="container mx-auto px-4 py-8 max-w-3xl dark:text-gray-200">
      <h1 className="text-3xl font-bold mb-6 text-gray-900 dark:text-white">Privacy Policy for KitchenSync</h1>
      
      <p className="mb-4">
        <strong>Last Updated: {new Date().toLocaleDateString()}</strong>
      </p>

      <p className="mb-4">
        Welcome to KitchenSync. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our mobile application and website.
      </p>

      <h2 className="text-2xl font-semibold mt-6 mb-3 text-gray-800 dark:text-gray-100">1. Information We Collect</h2>
      <p className="mb-4">
        We may collect information about you in a variety of ways. The information we may collect via the Application includes:
      </p>
      <ul className="list-disc pl-6 mb-4 space-y-2">
        <li><strong>Personal Data:</strong> Personally identifiable information, such as your name, email address, and demographic information that you voluntarily give to us when you register for the Application (via Auth0).</li>
        <li><strong>User Generated Data:</strong> Recipes, pantry items, and shopping lists you create and save within the application.</li>
        <li><strong>Financial Data:</strong> Financial information (such as credit card numbers) is collected and processed securely by our payment processor (Stripe) for Plus/Pro subscriptions. We do not store this information.</li>
      </ul>

      <h2 className="text-2xl font-semibold mt-6 mb-3 text-gray-800 dark:text-gray-100">2. Use of Your Information</h2>
      <p className="mb-4">
        Having accurate information about you permits us to provide you with a smooth, efficient, and customized experience. Specifically, we may use information collected about you via the Application to:
      </p>
      <ul className="list-disc pl-6 mb-4 space-y-2">
        <li>Create and manage your account.</li>
        <li>Process payments and subscriptions.</li>
        <li>Provide AI-generated recipe suggestions based on your pantry.</li>
        <li>Improve the application and user experience.</li>
      </ul>

      <h2 className="text-2xl font-semibold mt-6 mb-3 text-gray-800 dark:text-gray-100">3. Disclosure of Your Information</h2>
      <p className="mb-4">
        We share your data with the following third parties to operate our service:
      </p>
      <ul className="list-disc pl-6 mb-4 space-y-2">
        <li><strong>Auth0:</strong> For secure authentication and user sign-in.</li>
        <li><strong>Stripe:</strong> For processing subscription payments securely.</li>
        <li><strong>Google (Gemini AI):</strong> To generate recipes and interact with the AI features. (We send ingredients to the AI, but not personally identifiable information).</li>
      </ul>

      <h2 className="text-2xl font-semibold mt-6 mb-3 text-gray-800 dark:text-gray-100">4. Security of Your Information</h2>
      <p className="mb-4">
        We use administrative, technical, and physical security measures to help protect your personal information. While we have taken reasonable steps to secure the personal information you provide to us, please be aware that despite our efforts, no security measures are perfect or impenetrable, and no method of data transmission can be guaranteed against any interception or other type of misuse.
      </p>

      <h2 className="text-2xl font-semibold mt-6 mb-3 text-gray-800 dark:text-gray-100">5. Contact Us</h2>
      <p className="mb-4">
        If you have questions or comments about this Privacy Policy, please contact us at: support@kitchensync.com
      </p>
    </div>
  );
};

export default PrivacyPolicy;

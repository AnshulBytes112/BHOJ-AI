import React from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  LayoutDashboard,
  Receipt,
  Table as TableIcon,
  Package,
  BarChart3,
  Users,
  ArrowRight,
  TrendingUp,
  ShoppingCart,
  ChefHat,
  MonitorSmartphone,
  CheckCircle2,
  PlayCircle
} from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';

export default function Index() {
  const features = [
    {
      title: 'QR Ordering',
      description: 'Contactless ordering from table with QR.',
      icon: MonitorSmartphone,
      color: 'bg-orange-500/10 text-orange-500',
    },
    {
      title: 'Kitchen Management',
      description: 'Real-time KOT, status tracking & kitchen sync.',
      icon: ChefHat,
      color: 'bg-orange-500/10 text-orange-500',
    },
    {
      title: 'Billing & Payments',
      description: 'Fast billing, multiple payment modes.',
      icon: Receipt,
      color: 'bg-orange-500/10 text-orange-500',
    },
    {
      title: 'Analytics',
      description: 'Smart insights to grow your business.',
      icon: BarChart3,
      color: 'bg-orange-500/10 text-orange-500',
    },
    {
      title: 'Multi-Outlet',
      description: 'Manage multiple outlets from one place.',
      icon: LayoutDashboard,
      color: 'bg-orange-500/10 text-orange-500',
    },
    {
      title: 'AI Assistance',
      description: 'AI suggestions for menu, pricing & operations.',
      icon: TrendingUp,
      color: 'bg-orange-500/10 text-orange-500',
    },
    {
      title: 'POS & Billing',
      description: 'Quick service point of sale with GST compliance.',
      icon: Receipt,
      href: '/pos',
      color: 'bg-orange-500/10 text-orange-500',
    }
  ];

  return (
    <div className="flex min-h-screen flex-col bg-[#0f0f0f] text-white selection:bg-orange-500/30">
      {/* Navigation */}
      <nav className="border-b border-white/10 bg-[#0f0f0f]/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-20 items-center">
            <div className="flex items-center gap-2 cursor-pointer hover:opacity-90 transition-opacity">
              <div className="w-8 h-8 bg-orange-500 rounded flex items-center justify-center text-white">
                <ChefHat className="w-5 h-5" />
              </div>
              <span className="text-xl font-bold tracking-tight">
                BhojAI
              </span>
            </div>

            {/* Desktop Navigation Links */}
            <div className="hidden md:flex items-center gap-8 text-sm font-medium text-gray-300">
              <Link href="#features" className="hover:text-white transition-colors">Features</Link>
              <Link href="#pricing" className="hover:text-white transition-colors">Pricing</Link>
              <Link href="#about" className="hover:text-white transition-colors">About</Link>
              <Link href="#contact" className="hover:text-white transition-colors">Contact</Link>
            </div>

            <div className="flex items-center gap-4">
              <Link href="/login">
                <Button variant="ghost" className="text-gray-300 hover:text-white hover:bg-white/10">Login</Button>
              </Link>
              <Link href="/register">
                <Button className="bg-orange-500 hover:bg-orange-600 text-white border-0">
                  Super Admin Sign Up
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <header className="relative pt-24 pb-32 overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 grid lg:grid-cols-2 gap-12 items-center">

          <div className="text-left">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-orange-500/10 text-orange-500 text-sm font-medium mb-6 border border-orange-500/20">
              <span className="w-2 h-2 rounded-full bg-orange-500 animate-pulse"></span>
              AI-Powered Restaurant OS
            </div>

            <h1 className="text-5xl md:text-7xl font-bold tracking-tight mb-6 leading-tight">
              One Platform.<br />
              Every Restaurant.<br />
              <span className="text-orange-500">Limitless Possibilities.</span>
            </h1>

            <p className="text-xl text-gray-400 mb-10 max-w-lg leading-relaxed">
              BhojAI is the all-in-one operating system for restaurants.
              Manage orders, menus, staff, analytics and more —
              all from a single platform.
            </p>

            <div className="flex flex-col sm:flex-row gap-4">
              <Link href="/register">
                <Button size="lg" className="h-14 px-8 text-lg gap-2 bg-orange-500 hover:bg-orange-600 text-white rounded-xl w-full sm:w-auto">
                  Get Started as Super Admin <ArrowRight className="w-5 h-5" />
                </Button>
              </Link>
              <Button size="lg" variant="outline" className="h-14 px-8 text-lg gap-2 border-gray-700 hover:bg-gray-800 text-white rounded-xl w-full sm:w-auto">
                Explore Features <PlayCircle className="w-5 h-5" />
              </Button>
            </div>
          </div>

          {/* Abstract Dashboard Mockup */}
          <div className="relative w-full h-[500px] lg:h-[600px] flex items-center justify-center">
            {/* Background Glow */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[80%] h-[80%] bg-orange-500/20 blur-[120px] rounded-full pointer-events-none" />

            {/* UI Mockup Container */}
            <div className="relative w-full max-w-md aspect-[4/3] bg-[#1a1a1a] rounded-2xl border border-gray-800 shadow-2xl overflow-hidden flex flex-col transform lg:rotate-2 hover:rotate-0 transition-transform duration-500">
              {/* Mockup Header */}
              <div className="h-12 border-b border-gray-800 flex items-center px-4 justify-between bg-[#111]">
                <div className="flex items-center gap-2">
                  <ChefHat className="w-4 h-4 text-orange-500" />
                  <span className="text-sm font-semibold">BhojAI Dashboard</span>
                </div>
                <div className="flex gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-gray-700"></div>
                  <div className="w-2.5 h-2.5 rounded-full bg-gray-700"></div>
                  <div className="w-2.5 h-2.5 rounded-full bg-gray-700"></div>
                </div>
              </div>

              {/* Mockup Body */}
              <div className="flex-1 p-6 flex flex-col gap-6 bg-[#161616]">
                <div className="grid grid-cols-3 gap-4">
                  <div className="h-20 rounded-xl bg-gray-800/50 border border-gray-800 p-3 flex flex-col justify-center">
                    <div className="text-xs text-gray-500 mb-1">Total Orders</div>
                    <div className="text-xl font-bold">1,248</div>
                  </div>
                  <div className="h-20 rounded-xl bg-orange-500/10 border border-orange-500/20 p-3 flex flex-col justify-center">
                    <div className="text-xs text-orange-500/70 mb-1">Today's Revenue</div>
                    <div className="text-xl font-bold text-orange-500">₹48,350</div>
                  </div>
                  <div className="h-20 rounded-xl bg-gray-800/50 border border-gray-800 p-3 flex flex-col justify-center">
                    <div className="text-xs text-gray-500 mb-1">Active Tables</div>
                    <div className="text-xl font-bold">24</div>
                  </div>
                </div>

                <div className="flex-1 rounded-xl bg-gray-800/30 border border-gray-800 flex items-end p-4 relative overflow-hidden">
                  <div className="absolute top-4 left-4 text-sm font-medium text-gray-400">Revenue Overview</div>
                  {/* Mock Chart Line */}
                  <svg className="w-full h-24 stroke-orange-500" viewBox="0 0 100 40" preserveAspectRatio="none" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M0,30 L10,25 L20,35 L30,15 L40,20 L50,5 L60,10 L70,2 L80,15 L90,8 L100,20" />
                  </svg>
                </div>
              </div>
            </div>

            {/* Floating Element 1 */}
            <div className="absolute -bottom-6 -left-6 bg-[#1a1a1a] border border-gray-800 rounded-xl p-4 shadow-xl flex items-center gap-4 animate-bounce" style={{ animationDuration: '3s' }}>
              <div className="w-12 h-12 rounded-lg bg-green-500/10 flex items-center justify-center">
                <CheckCircle2 className="w-6 h-6 text-green-500" />
              </div>
              <div>
                <div className="text-sm font-medium">Order Completed</div>
                <div className="text-xs text-gray-500">Table 12 • ₹1,450</div>
              </div>
            </div>
          </div>

        </div>

      </header>

      {/* Logos Section */}
      <div className="border-y border-gray-800 bg-[#0a0a0a] py-8">
        <div className="max-w-7xl mx-auto px-4 text-center">
          <p className="text-sm text-gray-500 font-medium mb-6 uppercase tracking-wider">Trusted by modern restaurant brands</p>
          <div className="flex flex-wrap justify-center gap-12 md:gap-24 opacity-50 grayscale hover:grayscale-0 transition-all">
            <div className="flex items-center gap-2"><ChefHat /> <span className="font-bold">Spice Garden</span></div>
            <div className="flex items-center gap-2"><TableIcon /> <span className="font-bold">Food Court</span></div>
            <div className="flex items-center gap-2"><LayoutDashboard /> <span className="font-bold">Urban Bites</span></div>
            <div className="flex items-center gap-2"><ShoppingCart /> <span className="font-bold">Tandoor House</span></div>
          </div>
        </div>
      </div>

      {/* Feature Grid */}
      <section className="py-32 bg-white text-gray-900" id="features">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-20">
            <h2 className="text-4xl font-bold tracking-tight mb-4">Everything you need to run your restaurant</h2>
            <p className="text-xl text-gray-500 max-w-2xl mx-auto">
              A comprehensive suite of tools designed to streamline your operations, increase efficiency, and boost your bottom line.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {features.map((feature, i) => (
              <Card key={i} className="border border-gray-200 shadow-sm hover:shadow-md transition-all duration-300 hover:border-orange-200 group bg-gray-50/50">
                <CardHeader>
                  <div className={`w-12 h-12 rounded-xl ${feature.color} flex items-center justify-center mb-4`}>
                    <feature.icon className="w-6 h-6" />
                  </div>
                  <CardTitle className="text-xl text-gray-900">{feature.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription className="text-base text-gray-600">{feature.description}</CardDescription>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24 bg-[#111] border-t border-gray-800">
        <div className="max-w-5xl mx-auto px-4 text-center">
          <h2 className="text-3xl md:text-5xl font-bold mb-6">Built for scale. Designed for simplicity.</h2>
          <p className="text-xl text-gray-400 mb-10">Start your journey with BhojAI today.</p>
          <Link href="/register">
            <Button size="lg" className="h-14 px-10 text-lg bg-orange-500 hover:bg-orange-600 text-white rounded-xl">
              Create Your Account <ArrowRight className="w-5 h-5 ml-2" />
            </Button>
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-16 bg-[#0a0a0a] border-t border-gray-800 text-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-12">
            <div>
              <div className="flex items-center gap-2 mb-6">
                <div className="w-6 h-6 bg-orange-500 rounded flex items-center justify-center text-white">
                  <ChefHat className="w-3 h-3" />
                </div>
                <span className="text-lg font-bold">BhojAI</span>
              </div>
              <p className="text-gray-500 leading-relaxed max-w-xs">
                The intelligent operating system for restaurants of tomorrow.
              </p>
            </div>

            <div>
              <h3 className="font-semibold text-white mb-4">Product</h3>
              <ul className="space-y-3 text-gray-500">
                <li><Link href="#" className="hover:text-white transition-colors">Features</Link></li>
                <li><Link href="#" className="hover:text-white transition-colors">Pricing</Link></li>
                <li><Link href="#" className="hover:text-white transition-colors">Integrations</Link></li>
              </ul>
            </div>

            <div>
              <h3 className="font-semibold text-white mb-4">Company</h3>
              <ul className="space-y-3 text-gray-500">
                <li><Link href="#" className="hover:text-white transition-colors">About Us</Link></li>
                <li><Link href="#" className="hover:text-white transition-colors">Contact</Link></li>
                <li><Link href="#" className="hover:text-white transition-colors">Careers</Link></li>
              </ul>
            </div>

            <div>
              <h3 className="font-semibold text-white mb-4">Legal</h3>
              <ul className="space-y-3 text-gray-500">
                <li><Link href="#" className="hover:text-white transition-colors">Privacy Policy</Link></li>
                <li><Link href="#" className="hover:text-white transition-colors">Terms of Service</Link></li>
              </ul>
            </div>
          </div>

          <div className="pt-8 border-t border-gray-800 text-gray-500 flex flex-col md:flex-row justify-between items-center gap-4">
            <p>© 2026 BhojAI Restaurant OS. All rights reserved.</p>
            <div className="flex gap-4">
              {/* Placeholder for social icons */}
              <div className="w-8 h-8 rounded-full bg-gray-800 hover:bg-gray-700 transition-colors cursor-pointer"></div>
              <div className="w-8 h-8 rounded-full bg-gray-800 hover:bg-gray-700 transition-colors cursor-pointer"></div>
              <div className="w-8 h-8 rounded-full bg-gray-800 hover:bg-gray-700 transition-colors cursor-pointer"></div>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

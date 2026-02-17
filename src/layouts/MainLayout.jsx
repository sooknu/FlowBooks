/*
  TEMPLATE LAYOUT: Placeholder structure, subject to change based on requirements.
  Common alternatives: sidebar layout, auth layout, docs layout, etc.
  Create additional layouts in this folder as needed.
*/
import React from 'react';
import { Outlet } from 'react-router-dom';

function MainLayout() {
	return (
		<div className='surface-base min-h-screen'>
			<header className='border-b'>
				<div className='max-w-7xl mx-auto px-6 py-4'>
					<nav className='flex items-center justify-between'>
						{/* Navigation items */}
					</nav>
				</div>
			</header>

			<main className='max-w-7xl mx-auto px-6 py-8'>
				<Outlet />
			</main>

			<footer className='border-t mt-auto'>
				<div className='max-w-7xl mx-auto px-6 py-4 text-sm text-muted-foreground'>
					{/* Footer content */}
				</div>
			</footer>
		</div>
	);
}

export default MainLayout;

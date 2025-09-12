<?php

use App\Http\Controllers\ServiceController;
use App\Http\Controllers\UserController;
use App\Http\Controllers\UserRequestController;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| API Routes
|--------------------------------------------------------------------------
|
| Here is where you can register API routes for your application. These
| routes are loaded by the RouteServiceProvider within a group which
| is assigned the "api" middleware group. Enjoy building your API!
|
*/

Route::middleware(['auth:sanctum'])->get('/user', function (Request $request) {
    return $request->user();
});

Route::get('/services', [ServiceController::class, 'index']);
Route::get('/services/search', [ServiceController::class, 'searchServices']);
Route::get('/services/{id}', [ServiceController::class, 'show']);

Route::post('/register', [UserController::class, 'register']);
Route::post('/login', [UserController::class, 'login']);

Route::group(['middleware' => ['auth:sanctum']], function () {
    Route::resource('services', ServiceController::class)
        ->only(['store', 'update', 'destroy']);
    Route::resource('user-requests', UserRequestController::class)
        ->only(['index', 'show', 'store', 'update', 'destroy']);

    Route::put('/users/update-role', [UserController::class, 'updateRole']);
    Route::post('/logout', [UserController::class, 'logout']);
});
